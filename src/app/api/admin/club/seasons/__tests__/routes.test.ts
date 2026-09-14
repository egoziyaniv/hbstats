import { GET as getDossier, PUT as putDossier } from '../[seasonId]/route';
import { POST as postMoment } from '../[seasonId]/moments/route';
import { PUT as putMoment, DELETE as deleteMoment } from '../[seasonId]/moments/[id]/route';
import { POST as postSource } from '../[seasonId]/sources/route';
import { PUT as putSource, DELETE as deleteSource } from '../[seasonId]/sources/[id]/route';

jest.mock('@/lib/auth', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/season-dossier', () => ({ buildSeasonDossier: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    season: { findUnique: jest.fn() }, team: { findFirst: jest.fn() },
    clubSeasonDossier: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { requireAdminUser } from '@/lib/auth';
import { buildSeasonDossier } from '@/lib/season-dossier';
import prisma from '@/lib/prisma';

const params = (seasonId = 'season-2026') => ({ params: Promise.resolve({ seasonId }) });
const nestedParams = (id: string, seasonId = 'season-2026') => ({ params: Promise.resolve({ seasonId, id }) });
const request = (body: unknown) => ({ json: jest.fn().mockResolvedValue(body) } as any);
const dossier = { id: 'd1', seasonId: 'season-2026', teamId: 'team-hbs', isPublished: false, publishedAt: null };

function transaction(overrides: Record<string, any> = {}) {
  const tx = {
    season: { findUnique: jest.fn().mockResolvedValue({ id: 'season-2026', year: 2026 }) },
    team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-hbs' }) },
    clubSeasonDossier: { findUnique: jest.fn().mockResolvedValue(dossier), upsert: jest.fn(), update: jest.fn() },
    clubSeasonMoment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    clubSeasonSource: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    game: { findFirst: jest.fn() }, competitionSeason: { findUnique: jest.fn() },
    mediaAsset: { findFirst: jest.fn() },
    ...overrides,
  };
  (prisma.$transaction as jest.Mock).mockImplementation((callback) => callback(tx));
  return tx;
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireAdminUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  (prisma.season.findUnique as jest.Mock).mockResolvedValue({ id: 'season-2026', year: 2026 });
  (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: 'team-hbs' });
  (prisma.clubSeasonDossier.findUnique as jest.Mock).mockResolvedValue(dossier);
});

it('authorizes before reading a mutation body', async () => {
  (requireAdminUser as jest.Mock).mockRejectedValue(new Error('redirect'));
  const req = request({ introHe: 'x' });
  const response = await putDossier(req, params());
  expect(response.status).toBe(403);
  expect(req.json).not.toHaveBeenCalled();
});

it('returns the draft-enabled dossier and publication state', async () => {
  (buildSeasonDossier as jest.Mock).mockResolvedValue({ season: { id: 'season-2026' }, team: { id: 'team-hbs' } });
  const response = await getDossier({} as any, params());
  expect(response.status).toBe(200);
  expect(buildSeasonDossier).toHaveBeenCalledWith('season-2026', { includeDrafts: true });
  expect(await response.json()).toEqual(expect.objectContaining({ publication: { isPublished: false, publishedAt: null } }));
});

it('sets publishedAt only on a draft-to-published transition', async () => {
  const tx = transaction();
  tx.clubSeasonDossier.upsert.mockImplementation(({ create, update }: any) => ({ id: 'd1', ...create, ...update }));
  const response = await putDossier(request({ introHe: 'סיפור', isPublished: true }), params());
  expect(response.status).toBe(200);
  const args = tx.clubSeasonDossier.upsert.mock.calls[0][0];
  expect(args.update.publishedAt).toBeInstanceOf(Date);
  expect(args.create.publishedAt).toBeInstanceOf(Date);
});

it('rejects a linked game outside the dossier season/team', async () => {
  const tx = transaction();
  tx.game.findFirst.mockResolvedValue(null);
  const response = await postMoment(request({
    eventDate: '2026-08-17', titleHe: 'פתיחה', bodyHe: 'תיאור', gameId: 'foreign-game',
  }), params());
  expect(response.status).toBe(400);
  expect(tx.clubSeasonMoment.create).not.toHaveBeenCalled();
});

it('creates, updates and deletes a moment only inside the resolved dossier', async () => {
  const tx = transaction();
  tx.game.findFirst.mockResolvedValue({ id: 'g1' });
  tx.clubSeasonMoment.create.mockResolvedValue({ id: 'm1' });
  tx.clubSeasonMoment.findFirst.mockResolvedValue({ id: 'm1' });
  tx.clubSeasonMoment.update.mockResolvedValue({ id: 'm1', titleHe: 'עדכון' });
  tx.clubSeasonMoment.delete.mockResolvedValue({ id: 'm1' });
  expect((await postMoment(request({ eventDate: '2026-08-17', titleHe: 'רגע', bodyHe: 'תיאור', gameId: 'g1' }), params())).status).toBe(201);
  expect((await putMoment(request({ eventDate: '2026-08-18', titleHe: 'עדכון', bodyHe: 'תיאור' }), nestedParams('m1'))).status).toBe(200);
  expect((await deleteMoment({} as any, nestedParams('m1'))).status).toBe(204);
  expect(tx.clubSeasonMoment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1', dossierId: 'd1' } }));
});

it('rejects a source competition outside the season', async () => {
  const tx = transaction();
  tx.competitionSeason.findUnique.mockResolvedValue(null);
  const response = await postSource(request({
    labelHe: 'מקור', provider: 'IFA', url: 'https://football.org.il/a', competitionId: 'other-comp',
  }), params());
  expect(response.status).toBe(400);
  expect(tx.clubSeasonSource.create).not.toHaveBeenCalled();
});

it('creates, updates and deletes a source only inside the resolved dossier', async () => {
  const tx = transaction();
  tx.competitionSeason.findUnique.mockResolvedValue({ id: 'cs1' });
  tx.clubSeasonSource.create.mockResolvedValue({ id: 's1' });
  tx.clubSeasonSource.findFirst.mockResolvedValue({ id: 's1' });
  tx.clubSeasonSource.update.mockResolvedValue({ id: 's1' });
  tx.clubSeasonSource.delete.mockResolvedValue({ id: 's1' });
  const body = { labelHe: 'מקור', provider: 'IFA', url: 'https://football.org.il/a', competitionId: 'comp1' };
  expect((await postSource(request(body), params())).status).toBe(201);
  expect((await putSource(request(body), nestedParams('s1'))).status).toBe(200);
  expect((await deleteSource({} as any, nestedParams('s1'))).status).toBe(204);
  expect(tx.clubSeasonSource.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', dossierId: 'd1' } }));
});

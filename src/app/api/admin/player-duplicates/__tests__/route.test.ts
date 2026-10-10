jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));

import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import * as route from '../route';

const timestamp = '2026-09-29T10:00:00.000Z';
const player = (id: string, patch: Record<string, unknown> = {}) => ({
  id, teamId: 'team', nameHe: 'עידן ברנס', nameEn: id === 'primary' ? 'I. Barnes' : 'Idan Baranes', canonicalPlayerId: null,
  updatedAt: new Date(timestamp), birthDate: id === 'secondary' ? new Date('2004-03-26') : null,
  position: null, nationalityEn: null, nationalityHe: null, photoUrl: null, firstNameEn: null, firstNameHe: null, lastNameEn: null, lastNameHe: null,
  _count: { events: id === 'primary' ? 3 : 0, lineupEntries: id === 'primary' ? 5 : 0 }, ...patch,
});
const request = (body: unknown) => new Request('http://localhost/api/admin/player-duplicates', { method: 'POST', body: JSON.stringify(body) });
const mergeInput = { action: 'merge', primaryId: 'primary', secondaryId: 'secondary', expectedPrimaryUpdatedAt: timestamp, expectedSecondaryUpdatedAt: timestamp, copyFields: ['birthDate'] };
const linkInput = { action: 'link', sourceId: 'source', targetRootId: 'root', expectedSourceUpdatedAt: timestamp, expectedTargetUpdatedAt: timestamp };
let tx: any;

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  tx = {
    player: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.id === 'primary' ? player('primary') : player('secondary'))), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    activityLog: { create: jest.fn().mockResolvedValue({ id: 'merge-log', timestamp: new Date('2026-09-29T10:00:01.000Z') }), findUnique: jest.fn(), update: jest.fn() },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(tx));
});

it('denies a non-admin before opening a transaction', async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue({ role: 'USER' });
  expect((await route.POST(request(mergeInput))).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('links the secondary row while copying only its selected missing birth date', async () => {
  const response = await route.POST(request(mergeInput));
  expect(response.status).toBe(200);
  expect(tx.player.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'primary' }, data: { birthDate: new Date('2004-03-26') } }));
  expect(tx.player.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['secondary'] } }, data: { canonicalPlayerId: 'primary' } });
  expect(tx.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionHe: 'איחוד שחקנים ידני' }) }));
});

it('rejects a non-allowlisted field without opening a transaction', async () => {
  expect((await route.POST(request({ ...mergeInput, copyFields: ['apiFootballId'] }))).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rejects a malformed pair before opening a transaction', async () => {
  expect((await route.POST(request({ ...mergeInput, primaryId: 'secondary', secondaryId: 'secondary' }))).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('repairs a self-link by attaching it to a verified root without copying fields', async () => {
  const source = player('source', { canonicalPlayerId: 'source', nameHe: 'נועם בן הרוש', nameEn: 'Noam Ben Harosh', birthDate: new Date('2005-05-13') });
  const root = player('root', { nameHe: 'נועם בן הרוש', nameEn: 'N. Ben Harush', birthDate: new Date('2005-05-13') });
  tx.player.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'source' ? source : root));
  const response = await route.POST(request(linkInput));
  expect(response.status).toBe(200);
  expect(tx.player.update).toHaveBeenCalledWith({ where: { id: 'source' }, data: { canonicalPlayerId: 'root' } });
  expect(tx.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionHe: 'קישור לרשומת שחקן קיימת' }) }));
});

it('rejects linking to a player that is not a canonical root', async () => {
  const source = player('source', { canonicalPlayerId: 'source', nameHe: 'נועם בן הרוש', nameEn: 'Noam Ben Harosh', birthDate: new Date('2005-05-13') });
  const root = player('root', { canonicalPlayerId: 'other', nameHe: 'נועם בן הרוש', nameEn: 'N. Ben Harush', birthDate: new Date('2005-05-13') });
  tx.player.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'source' ? source : root));
  expect((await route.POST(request(linkInput))).status).toBe(409);
});

it('undoes a family link only when both affected records are unchanged', async () => {
  tx.activityLog.findUnique.mockResolvedValue({
    id: 'link-log', entityType: 'PLAYER', actionHe: 'קישור לרשומת שחקן קיימת', timestamp: new Date('2026-09-29T10:00:01.000Z'),
    details: { type: 'PLAYER_FAMILY_LINK', sourceId: 'source', targetRootId: 'root', previousCanonicalId: 'source' },
  });
  tx.player.findMany.mockResolvedValue([
    { id: 'source', canonicalPlayerId: 'root', updatedAt: new Date(timestamp) },
    { id: 'root', canonicalPlayerId: null, updatedAt: new Date(timestamp) },
  ]);
  expect((await route.POST(request({ action: 'undo-link', linkId: 'link-log' }))).status).toBe(200);
  expect(tx.player.update).toHaveBeenCalledWith({ where: { id: 'source' }, data: { canonicalPlayerId: 'source' } });
  expect(tx.activityLog.update).toHaveBeenCalled();
});

it('undo restores the linked row and only the field copied by this merge', async () => {
  tx.activityLog.findUnique.mockResolvedValue({
    id: 'merge-log', entityType: 'PLAYER', actionHe: 'איחוד שחקנים ידני', timestamp: new Date('2026-09-29T10:00:01.000Z'),
    details: { type: 'MANUAL_PLAYER_MERGE', primaryId: 'primary', secondaryId: 'secondary', memberIds: ['secondary'], copiedBefore: { birthDate: null }, previousCanonicalIds: { secondary: null } },
  });
  tx.player.findMany.mockResolvedValue([
    { id: 'primary', canonicalPlayerId: null, updatedAt: new Date(timestamp) },
    { id: 'secondary', canonicalPlayerId: 'primary', updatedAt: new Date(timestamp) },
  ]);
  expect((await route.POST(request({ action: 'undo', mergeId: 'merge-log' }))).status).toBe(200);
  expect(tx.player.update).toHaveBeenCalledWith({ where: { id: 'primary' }, data: { birthDate: null } });
  expect(tx.player.update).toHaveBeenCalledWith({ where: { id: 'secondary' }, data: { canonicalPlayerId: null } });
  expect(tx.activityLog.update).toHaveBeenCalled();
});

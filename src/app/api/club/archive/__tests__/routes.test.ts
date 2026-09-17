import { GET, POST } from '../route';
import { GET as getItem, PUT } from '../[id]/route';
import { PATCH } from '../../../admin/archive/[id]/route';

jest.mock('@/lib/auth', () => ({ getRequestUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  fanArchiveRevision: { create: jest.fn() },
  fanArchiveItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  game: { findUnique: jest.fn() }, season: { findUnique: jest.fn() }, player: { findUnique: jest.fn() }, venue: { findUnique: jest.fn() },
  $transaction: jest.fn(),
} }));
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
const db = prisma as any;
const req = (body: unknown = {}, query = '') => ({ json: jest.fn().mockResolvedValue({ expectedUpdatedAt: '2026-09-17T12:00:00.000Z', ...(body as object) }), nextUrl: new URL(`http://localhost/api/club/archive${query}`) } as any);
const context = { params: Promise.resolve({ id: 'a1' }) };
const input = { type: 'MEMORY', titleHe: 'זיכרון', bodyHe: 'סיפור מהיציע', creditHe: 'אוהד', permissionGranted: true, action: 'submit' };
beforeEach(() => {
  jest.clearAllMocks();
  (getRequestUser as jest.Mock).mockResolvedValue({ id: 'u1', role: 'USER' });
  db.$transaction.mockImplementation((fn: any) => fn(db));
  db.fanArchiveItem.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));
  db.fanArchiveItem.findMany.mockResolvedValue([]);
  db.fanArchiveItem.findFirst.mockResolvedValue(null);
  db.fanArchiveItem.updateMany.mockResolvedValue({ count: 1 });
});
it('requires authentication before reading submission body', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue(null);
  const request = req(input);
  expect((await POST(request)).status).toBe(401);
  expect(request.json).not.toHaveBeenCalled();
});
it('records the actual owner and queues publication for review', async () => {
  const response = await POST(req({ ...input, authorId: 'other', status: 'PUBLISHED' }));
  expect(response.status).toBe(201);
  expect(db.fanArchiveItem.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ authorId: 'u1', status: 'PENDING' }));
});
it('rejects missing linked entities before creating a submission', async () => {
  db.game.findUnique.mockResolvedValue(null);
  expect((await POST(req({ ...input, gameId: 'missing' }))).status).toBe(400);
  expect(db.fanArchiveItem.create).not.toHaveBeenCalled();
});
it('rejects a game linked to a different season', async () => {
  db.game.findUnique.mockResolvedValue({ id: 'g', seasonId: 's1' });
  db.season.findUnique.mockResolvedValue({ id: 's2' });
  expect((await POST(req({ ...input, gameId: 'g', seasonId: 's2' }))).status).toBe(400);
});
it('public collection only selects approved entries and excludes private fields', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue(null);
  expect((await GET(req())).status).toBe(200);
  const query = db.fanArchiveItem.findMany.mock.calls[0][0];
  expect(query.where).toEqual({ status: 'PUBLISHED', permissionGranted: true });
  expect(query.select).not.toHaveProperty('authorId');
  expect(query.select).not.toHaveProperty('reviewNoteHe');
});
it('owner list requires auth and stays scoped to that user', async () => {
  expect((await GET(req({}, '?mine=1'))).status).toBe(200);
  expect(db.fanArchiveItem.findMany.mock.calls[0][0].where).toEqual({ authorId: 'u1' });
  (getRequestUser as jest.Mock).mockResolvedValue(null);
  expect((await GET(req({}, '?mine=1'))).status).toBe(401);
});
it('unknown or inaccessible entry returns 404 and owner write is restricted', async () => {
  expect((await getItem(req(), context)).status).toBe(404);
  expect((await PUT(req(input), context)).status).toBe(404);
  expect(db.fanArchiveItem.updateMany).not.toHaveBeenCalled();
});
it('owner edits reset review and only update an owned unpublished row', async () => {
  db.fanArchiveItem.findFirst.mockResolvedValue({ id: 'a1', authorId: 'u1', status: 'REJECTED', updatedAt: new Date('2026-09-17T12:00:00Z') });
  expect((await PUT(req(input), context)).status).toBe(200);
  expect(db.fanArchiveItem.updateMany.mock.calls[0][0]).toEqual(expect.objectContaining({
    where: { id: 'a1', authorId: 'u1', status: { not: 'PUBLISHED' }, updatedAt: new Date('2026-09-17T12:00:00Z') },
    data: expect.objectContaining({ status: 'PENDING', reviewNoteHe: null, reviewedById: null, reviewedAt: null }),
  }));
  expect(db.fanArchiveRevision.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ itemId: 'a1', action: 'OWNER_EDIT' }),
  }));
});
it('normal users cannot moderate', async () => {
  expect((await PATCH(req({ action: 'publish' }), context)).status).toBe(403);
  expect(db.fanArchiveItem.updateMany).not.toHaveBeenCalled();
});
it('admin cannot publish draft, rejected, or unlicensed items', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  for (const item of [{ status: 'DRAFT', permissionGranted: true }, { status: 'REJECTED', permissionGranted: true }, { status: 'PENDING', permissionGranted: false }]) {
    db.fanArchiveItem.findFirst.mockResolvedValue({ id: 'a1', ...item });
    expect((await PATCH(req({ action: 'publish' }), context)).status).toBe(409);
  }
  expect(db.fanArchiveItem.updateMany).not.toHaveBeenCalled();
});
it('publishes only pending licensed rows with reviewer and timestamp', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  db.fanArchiveItem.findFirst.mockResolvedValue({ id: 'a1', status: 'PENDING', permissionGranted: true, updatedAt: new Date('2026-09-17T12:00:00Z') });
  expect((await PATCH(req({ action: 'publish' }), context)).status).toBe(200);
  expect(db.fanArchiveItem.updateMany.mock.calls[0][0]).toEqual(expect.objectContaining({
    where: { id: 'a1', status: 'PENDING', permissionGranted: true, updatedAt: new Date('2026-09-17T12:00:00Z') },
    data: expect.objectContaining({ status: 'PUBLISHED', reviewedById: 'admin', publishedAt: expect.any(Date) }),
  }));
  expect(db.fanArchiveRevision.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ itemId: 'a1', action: 'PUBLISH' }),
  }));
});
it('returns conflict when an item changed during moderation', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  db.fanArchiveItem.findFirst.mockResolvedValue({ id: 'a1', status: 'PENDING', permissionGranted: true, updatedAt: new Date('2026-09-17T12:00:00Z') });
  db.fanArchiveItem.updateMany.mockResolvedValue({ count: 0 });
  expect((await PATCH(req({ action: 'publish' }), context)).status).toBe(409);
});
it('rejects a stale review even when item is still pending', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  db.fanArchiveItem.findFirst.mockResolvedValue({ id: 'a1', status: 'PENDING', permissionGranted: true, updatedAt: new Date('2026-09-17T12:00:00Z') });
  expect((await PATCH(req({ action: 'publish', expectedUpdatedAt: '2026-09-17T11:00:00Z' }), context)).status).toBe(409);
  expect(db.fanArchiveItem.updateMany).not.toHaveBeenCalled();
});

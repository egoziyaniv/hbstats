jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { player: { findUnique: jest.fn(), updateMany: jest.fn() } } }));
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import * as route from '../route';
const timestamp = '2026-09-20T10:00:00.000Z';
const info = { other: { keep: true }, departed: true, rosterStatus: { kind: 'LOAN', confidence: 'REVIEW', sourceUrl: 'https://example.com/evidence', showInSquadArchive: false } };
const request = (body: unknown) => new Request('http://localhost/api/admin/roster-integrity', { method: 'POST', body: JSON.stringify(body) });
const input = { playerId: 'p1', action: 'approve', expectedUpdatedAt: timestamp };
beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  (prisma.player.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', additionalInfo: info, updatedAt: new Date(timestamp) });
  (prisma.player.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
});
it('exposes a POST handler', () => expect(typeof route.POST).toBe('function'));
it.each([null, { role: 'USER' }])('denies non-admin %p', async (user) => {
  (getCurrentUser as jest.Mock).mockResolvedValue(user);
  expect((await route.POST(request(input))).status).toBe(403);
  expect(prisma.player.findUnique).not.toHaveBeenCalled();
});
it('approves while preserving evidence and unrelated JSON', async () => {
  expect((await route.POST(request(input))).status).toBe(200);
  expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', updatedAt: new Date(timestamp) }, data: { additionalInfo: expect.objectContaining({ other: info.other, rosterStatus: expect.objectContaining({ ...info.rosterStatus, confidence: 'VERIFIED' }) }) } }));
});
it('updates destination/date/status without replacing source evidence', async () => {
  expect((await route.POST(request({ ...input, action: 'update', kind: 'SOLD', destinationNameHe: ' יעד ', effectiveDate: '2024-02-29' }))).status).toBe(200);
  expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { additionalInfo: expect.objectContaining({ rosterStatus: expect.objectContaining({ kind: 'SOLD', destinationNameHe: 'יעד', effectiveDate: '2024-02-29', sourceUrl: info.rosterStatus.sourceUrl }) }) } }));
});
it('reject clears both status markers without a future-sync suppression flag', async () => {
  expect((await route.POST(request({ ...input, action: 'reject' }))).status).toBe(200);
  expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { additionalInfo: { other: info.other } } }));
});
it.each([{ action: 'delete' }, { expectedUpdatedAt: 'bad' }, { kind: 'ACTIVE' }, { effectiveDate: '2025-02-29' }, { effectiveDate: '2026-04-31' }, { destinationNameHe: 'a'.repeat(201) }])('rejects invalid payload %p', async (patch) => {
  expect((await route.POST(request({ ...input, action: 'update', kind: 'SOLD', ...patch }))).status).toBe(400);
  expect(prisma.player.updateMany).not.toHaveBeenCalled();
});
it('returns 404 for missing player', async () => {
  (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);
  expect((await route.POST(request(input))).status).toBe(404);
});
it('rejects stale input before writing', async () => {
  expect((await route.POST(request({ ...input, expectedUpdatedAt: '2026-09-19T10:00:00.000Z' }))).status).toBe(409);
  expect(prisma.player.updateMany).not.toHaveBeenCalled();
});
it('rejects a concurrent update atomically', async () => {
  (prisma.player.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  expect((await route.POST(request(input))).status).toBe(409);
});
it('does not create a status for an active player', async () => {
  (prisma.player.findUnique as jest.Mock).mockResolvedValue({ additionalInfo: {}, updatedAt: new Date(timestamp) });
  expect((await route.POST(request(input))).status).toBe(409);
});
it('allows explicitly clearing optional fields while retaining evidence', async () => {
  (prisma.player.findUnique as jest.Mock).mockResolvedValue({ additionalInfo: { ...info, rosterStatus: { ...info.rosterStatus, effectiveDate: '2026-01-01', destinationNameHe: 'old' } }, updatedAt: new Date(timestamp) });
  expect((await route.POST(request({ ...input, action: 'update', kind: 'LOAN', destinationNameHe: '', effectiveDate: '' }))).status).toBe(200);
  const saved = (prisma.player.updateMany as jest.Mock).mock.calls[0][0].data.additionalInfo.rosterStatus;
  expect(saved.destinationNameHe).toBeUndefined();
  expect(saved.effectiveDate).toBeUndefined();
  expect(saved.sourceUrl).toBe(info.rosterStatus.sourceUrl);
});
it('rejects legacy departed-only status', async () => {
  (prisma.player.findUnique as jest.Mock).mockResolvedValue({ additionalInfo: { other: 1, departed: true }, updatedAt: new Date(timestamp) });
  expect((await route.POST(request({ ...input, action: 'reject' }))).status).toBe(200);
  expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { additionalInfo: { other: 1 } } }));
});
it('rejects malformed JSON', async () => {
  expect((await route.POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
});
it.each([{ action: ['reject'] }, { kind: ['SOLD'] }])('rejects array-coerced enum values %p', async (patch) => {
  expect((await route.POST(request({ ...input, action: 'update', kind: 'SOLD', ...patch }))).status).toBe(400);
  expect(prisma.player.updateMany).not.toHaveBeenCalled();
});
it('atomically saves pending edits when approving', async () => {
  expect((await route.POST(request({ ...input, kind: 'SOLD', destinationNameHe: 'יעד חדש', effectiveDate: '2026-09-21' }))).status).toBe(200);
  expect(prisma.player.updateMany).toHaveBeenCalledTimes(1);
  expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { additionalInfo: expect.objectContaining({ rosterStatus: expect.objectContaining({ kind: 'SOLD', destinationNameHe: 'יעד חדש', effectiveDate: '2026-09-21', confidence: 'VERIFIED', sourceUrl: info.rosterStatus.sourceUrl }) }) } }));
});
it('validates pending edits before approving', async () => {
  expect((await route.POST(request({ ...input, kind: 'SOLD', effectiveDate: '2026-02-30' }))).status).toBe(400);
  expect(prisma.player.updateMany).not.toHaveBeenCalled();
});

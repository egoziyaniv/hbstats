import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
jest.mock('@/lib/auth', () => ({ getRequestUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { game: { findUnique: jest.fn() }, userMatchAttendance: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() } } }));
const context = { params: Promise.resolve({ gameId: 'game-1' }) };
const request = (body: unknown) => new NextRequest('http://localhost/api/account/matchdays/game-1', { method: 'PUT', body: JSON.stringify(body) });
beforeEach(() => { jest.clearAllMocks(); (getRequestUser as jest.Mock).mockResolvedValue({ id: 'owner' }); (prisma.game.findUnique as jest.Mock).mockResolvedValue({ id: 'game-1' }); });
it('reads only the current user note', async () => {
  (prisma.userMatchAttendance.findUnique as jest.Mock).mockResolvedValue({ note: 'המשחק הראשון שלי' });
  const response = await GET(new NextRequest('http://localhost/api/account/matchdays/game-1'), context);
  expect(await response.json()).toEqual({ attended: true, note: 'המשחק הראשון שלי' });
  expect(prisma.userMatchAttendance.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_gameId: { userId: 'owner', gameId: 'game-1' } } }));
});
it('stores a private note under the authenticated owner, ignoring supplied userId', async () => {
  expect((await PUT(request({ attended: true, note: ' זיכרון ', userId: 'victim' }), context)).status).toBe(200);
  expect(prisma.userMatchAttendance.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { userId: 'owner', gameId: 'game-1', note: 'זיכרון' }, update: { note: 'זיכרון' } }));
});
it('does not overwrite a note when the existing toggle omits it', async () => {
  await PUT(request({ attended: true }), context);
  expect(prisma.userMatchAttendance.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
});
it.each([1001, 40000])('rejects notes longer than the limit (%s)', async length => {
  expect((await PUT(request({ attended: true, note: 'a'.repeat(length) }), context)).status).toBe(400);
  expect(prisma.userMatchAttendance.upsert).not.toHaveBeenCalled();
});
it('removes only the owner attendance and its note', async () => {
  await PUT(request({ attended: false }), context);
  expect(prisma.userMatchAttendance.deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner', gameId: 'game-1' } });
});
it('denies unauthenticated note reads', async () => {
  (getRequestUser as jest.Mock).mockResolvedValue(null);
  expect((await GET(new NextRequest('http://localhost/api/account/matchdays/game-1'), context)).status).toBe(401);
});

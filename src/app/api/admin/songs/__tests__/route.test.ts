import { POST } from '../route';

jest.mock('@/lib/auth', () => ({ getRequestUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { song: { create: jest.fn(), findUnique: jest.fn() } },
}));

import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const req = (body: unknown) => ({ json: async () => body } as any);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/admin/songs', () => {
  it('rejects non-admin', async () => {
    (getRequestUser as jest.Mock).mockResolvedValue({ role: 'USER' });
    const res = await POST(req({ titleHe: 'x' }));
    expect(res.status).toBe(401);
  });

  it('400 without titleHe', async () => {
    (getRequestUser as jest.Mock).mockResolvedValue({ role: 'ADMIN' });
    const res = await POST(req({ type: 'STAND' }));
    expect(res.status).toBe(400);
  });

  it('creates with a derived Hebrew slug + cleaned videoUrls', async () => {
    (getRequestUser as jest.Mock).mockResolvedValue({ role: 'ADMIN' });
    (prisma.song.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.song.create as jest.Mock).mockImplementation(({ data }: any) => ({ id: 's1', ...data }));
    const res = await POST(
      req({ titleHe: 'אין כמו באר שבע', type: 'STAND', videoUrls: ['https://youtu.be/abc123DEF45', '  '] }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe('אין-כמו-באר-שבע');
    expect(json.type).toBe('STAND');
    expect(json.videoUrls).toEqual(['https://youtu.be/abc123DEF45']);
  });

  it('suffixes the slug on collision', async () => {
    (getRequestUser as jest.Mock).mockResolvedValue({ role: 'ADMIN' });
    (prisma.song.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'taken' }) // base slug taken
      .mockResolvedValueOnce(null); // -2 free
    (prisma.song.create as jest.Mock).mockImplementation(({ data }: any) => ({ id: 's2', ...data }));
    const res = await POST(req({ titleHe: 'קדימה הפועל' }));
    const json = await res.json();
    expect(json.slug).toBe('קדימה-הפועל-2');
  });
});

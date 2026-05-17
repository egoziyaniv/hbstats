import { GET } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { TeamPayload } from '@shared/types/mobile-api';

function mkReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/mobile/v1/teams/${id}`);
}

describe('GET /api/mobile/v1/teams/:id — TeamPayload contract', () => {
  test('returns 404 for non-existent team', async () => {
    const res = await GET(mkReq('bogus'), { params: { id: 'bogus' } });
    expect(res.status).toBe(404);
  });

  test('returns 200 with TeamPayload shape', async () => {
    // Pick a team from the latest season so the route's old-id-resolver does
    // not redirect us to a different team id (which would break the equality
    // check below).
    const latestSeason = await prisma.season.findFirst({
      orderBy: { year: 'desc' },
      select: { id: true },
    });
    const team = latestSeason
      ? await prisma.team.findFirst({ where: { seasonId: latestSeason.id }, select: { id: true } })
      : await prisma.team.findFirst({ select: { id: true } });
    if (!team) {
      console.warn('No teams in dev DB — skipping');
      return;
    }
    const res = await GET(mkReq(team.id), { params: { id: team.id } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TeamPayload;
    expect(body.team.id).toBe(team.id);
    expect(Array.isArray(body.recentForm)).toBe(true);
    expect(Array.isArray(body.squad)).toBe(true);
    expect(body).toHaveProperty('seasonStats');
  });
});

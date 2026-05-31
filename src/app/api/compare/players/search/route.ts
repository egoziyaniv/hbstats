/**
 * Search endpoint for the compare-players picker. Given a (seasonId, teamId)
 * pair, returns the list of players that played for that team in that season
 * — used to populate the third dropdown in the comparison UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seasonId = searchParams.get('seasonId');
  const teamId = searchParams.get('teamId');

  if (!seasonId) return NextResponse.json({ players: [] });

  // Find all teams matching the chosen team (cross-season by nameHe match
  // would be confusing here — we want only the players for the selected season).
  const team = teamId ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, seasonId: true } }) : null;
  if (teamId && (!team || team.seasonId !== seasonId)) {
    return NextResponse.json({ players: [] });
  }

  const players = await prisma.player.findMany({
    where: {
      ...(teamId ? { teamId } : { team: { seasonId } }),
    },
    select: {
      id: true, nameHe: true, nameEn: true, photoUrl: true, jerseyNumber: true, position: true,
      canonicalPlayerId: true,
    },
    orderBy: [{ jerseyNumber: 'asc' }, { nameEn: 'asc' }],
  });

  return NextResponse.json({
    players: players.map((p) => ({
      id: p.id,
      canonicalId: p.canonicalPlayerId ?? p.id,
      displayName: p.nameHe || p.nameEn,
      photoUrl: p.photoUrl,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
    })),
  });
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Returns a coach's aliases + the teams they coached (grouped by club, since
// each Team row is per-season), with per-team match counts and seasons.
// Match counts come from GameLineupEntry COACH rows matched on the coach's aliases.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const coach = await prisma.coach.findUnique({
    where: { id: params.id },
    include: { aliases: { select: { alias: true } } },
  });
  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  const aliases = coach.aliases.map((a) => a.alias);

  const entries = aliases.length
    ? await prisma.gameLineupEntry.findMany({
        where: { role: 'COACH', participantName: { in: aliases } },
        select: {
          team: { select: { nameHe: true, nameEn: true, logoUrl: true } },
          game: { select: { season: { select: { year: true } } } },
        },
      })
    : [];

  const byTeam = new Map<
    string,
    { teamName: string; logoUrl: string | null; matches: number; seasons: Set<number> }
  >();
  for (const e of entries) {
    const name = e.team.nameHe || e.team.nameEn;
    const cur =
      byTeam.get(name) ?? { teamName: name, logoUrl: e.team.logoUrl, matches: 0, seasons: new Set<number>() };
    cur.matches += 1;
    if (!cur.logoUrl && e.team.logoUrl) cur.logoUrl = e.team.logoUrl;
    if (typeof e.game?.season?.year === 'number') cur.seasons.add(e.game.season.year);
    byTeam.set(name, cur);
  }

  const teams = [...byTeam.values()]
    .map((t) => ({
      teamName: t.teamName,
      logoUrl: t.logoUrl,
      matches: t.matches,
      seasons: [...t.seasons].sort((a, b) => b - a),
    }))
    .sort((a, b) => b.matches - a.matches);

  return NextResponse.json({
    aliases,
    teams,
    totalMatches: teams.reduce((sum, t) => sum + t.matches, 0),
  });
}

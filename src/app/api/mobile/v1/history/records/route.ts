import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { RECORD_CATEGORIES } from '@/lib/history/records-engine';
import { getCurrentLeagueClubFamilies } from '@/lib/history/club-identity';
import type { RecordsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const catParam = searchParams.get('cat');
  const clubParam = searchParams.get('club');

  // Club picker offers current Ligat Ha'al clubs only.
  const leagueClubs = await getCurrentLeagueClubFamilies();
  const clubs = leagueClubs.map((f) => ({ clubKey: f.clubKey, nameHe: f.nameHe, logoUrl: f.logoUrl }));
  const activeClub = clubParam ? leagueClubs.find((f) => f.clubKey === clubParam) ?? null : null;

  const mapRow = (row: {
    id: string; rank: number; labelHe: string; detailHe: string | null;
    playerId: string | null; gameId: string | null; computedAt: Date; category: string;
  }) => ({
    id: row.id,
    rank: row.rank,
    labelHe: row.labelHe,
    detailHe: row.detailHe,
    playerId: row.playerId,
    gameId: row.gameId,
    computedAt: row.computedAt.toISOString(),
  });

  if (activeClub) {
    // Club mode: the club's whole record book grouped by category (top-5 each).
    const clubRows = await prisma.recordEntry.findMany({
      where: { scope: `club:${activeClub.clubKey}` },
      orderBy: { rank: 'asc' },
    });
    const groups = RECORD_CATEGORIES
      .map((cat) => ({
        category: cat.key,
        titleHe: cat.titleHe,
        rows: clubRows.filter((r) => r.category === cat.key).map(mapRow),
      }))
      .filter((g) => g.rows.length > 0);

    const payload: RecordsPayload = {
      category: null,
      categories: RECORD_CATEGORIES,
      clubs,
      club: { clubKey: activeClub.clubKey, nameHe: activeClub.nameHe, logoUrl: activeClub.logoUrl },
      rows: [],
      clubGroups: groups,
    };
    return NextResponse.json(payload);
  }

  const activeCategory = RECORD_CATEGORIES.find((c) => c.key === catParam) ?? RECORD_CATEGORIES[0];
  const rows = activeCategory
    ? await prisma.recordEntry.findMany({
        where: { category: activeCategory.key, scope: 'league' },
        orderBy: { rank: 'asc' },
      })
    : [];

  const payload: RecordsPayload = {
    category: activeCategory?.key ?? '',
    categories: RECORD_CATEGORIES,
    clubs,
    club: null,
    rows: rows.map(mapRow),
    clubGroups: [],
  };

  return NextResponse.json(payload);
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { RECORD_CATEGORIES } from '@/lib/history/records-engine';
import type { RecordsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const catParam = searchParams.get('cat');
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
    rows: rows.map((row) => ({
      id: row.id,
      rank: row.rank,
      labelHe: row.labelHe,
      detailHe: row.detailHe,
      playerId: row.playerId,
      gameId: row.gameId,
      computedAt: row.computedAt.toISOString(),
    })),
  };

  return NextResponse.json(payload);
}

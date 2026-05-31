/**
 * Returns the teams that played in the given season — feeds the
 * compare-players picker's team dropdown.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  // Only return teams that actually have at least one player on record for
  // this season — surfacing empty placeholder teams (e.g. lower-division
  // duplicates) just confuses the picker.
  const teams = await prisma.team.findMany({
    where: {
      seasonId: params.id,
      players: { some: {} },
    },
    select: { id: true, nameHe: true, nameEn: true, logoUrl: true, _count: { select: { players: true } } },
    orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
  });
  return NextResponse.json({ teams });
}

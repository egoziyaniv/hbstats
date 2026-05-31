/**
 * Returns the teams that played in the given season — feeds the
 * compare-players picker's team dropdown.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const teams = await prisma.team.findMany({
    where: { seasonId: params.id },
    select: { id: true, nameHe: true, nameEn: true, logoUrl: true },
    orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
  });
  return NextResponse.json({ teams });
}

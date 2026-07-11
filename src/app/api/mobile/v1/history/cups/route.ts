import { NextResponse } from 'next/server';
import { getAllHonors, getCupFinals } from '@/lib/history/club-honors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [honors, finals] = await Promise.all([getAllHonors(), getCupFinals()]);
  return NextResponse.json({ honors, finals });
}

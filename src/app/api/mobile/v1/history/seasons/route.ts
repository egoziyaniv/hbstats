import { NextResponse } from 'next/server';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await getSeasonsSpine();
  return NextResponse.json({ rows });
}

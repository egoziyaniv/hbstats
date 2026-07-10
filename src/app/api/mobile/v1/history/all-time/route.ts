import { NextRequest, NextResponse } from 'next/server';
import { buildAllTimeTable } from '@/lib/history/all-time-table';
import type { AllTimeTablePayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get('scope');
  const scope: AllTimeTablePayload['scope'] = scopeParam === 'home' || scopeParam === 'away' ? scopeParam : 'all';

  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const fromYear = fromParam && Number.isFinite(Number(fromParam)) ? Number(fromParam) : undefined;
  const toYear = toParam && Number.isFinite(Number(toParam)) ? Number(toParam) : undefined;

  const rows = await buildAllTimeTable({ scope, fromYear, toYear });
  return NextResponse.json({ scope, rows });
}

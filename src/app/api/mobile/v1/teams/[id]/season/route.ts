import { NextResponse } from 'next/server';
import { buildTeamSeasonSnapshot } from '@/lib/team-season-snapshot';
import type { TeamSeasonPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await buildTeamSeasonSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  // Typed against the shared contract, so the web computation and the app cannot drift.
  const payload: TeamSeasonPayload = snapshot;
  return NextResponse.json(payload);
}

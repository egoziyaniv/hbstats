import type { RosterStatusKind } from '@/lib/roster-status';

export type Confidence = 'VERIFIED' | 'REVIEW';
export type Identity = { apiFootballId?: number | null; nameEn?: string | null; birthDate?: string | Date | null };
export type IntegrityPlayer = Identity & { id: string; nameHe?: string | null; teamApiFootballId?: number | null; canonicalPlayerId?: string | null };
export type IntegrityTransfer = { apiFootballPlayerId?: number | null; sourceTeamApiFootballId?: number | null; destinationTeamNameHe?: string | null; transferDate?: Date | null; transferTypeEn?: string | null; sourceUrl?: string | null };
export type IntegrityAction = { playerId: string; kind: RosterStatusKind; destinationNameHe?: string; effectiveDate?: string; sourceUrl?: string; confidence: Confidence; reason: string };
export type IntegrityReport = { verified: IntegrityAction[]; review: IntegrityAction[]; duplicates: Array<{ leftPlayerId: string; rightPlayerId: string; confidence: Confidence }> };

const normalized = (value?: string | null) => value?.replace(/&#\d+;|&\w+;/g, '').replace(/[.'’`-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase() || '';
const dateValue = (value?: string | Date | null) => value instanceof Date ? value.toISOString().slice(0, 10) : value || '';

export function scoreDuplicateCandidate(left: Identity, right: Identity): Confidence {
  if (left.apiFootballId && left.apiFootballId === right.apiFootballId) return 'VERIFIED';
  if (dateValue(left.birthDate) && dateValue(left.birthDate) === dateValue(right.birthDate) && normalized(left.nameEn) === normalized(right.nameEn)) return 'VERIFIED';
  return 'REVIEW';
}

function movementKind(type?: string | null): RosterStatusKind {
  const value = (type || '').toLowerCase();
  if (value.includes('loan')) return 'LOAN';
  if (value.includes('transfer') || value.includes('sold')) return 'SOLD';
  return 'DEPARTED';
}

export function classifyTransfer(transfer: IntegrityTransfer, player: IntegrityPlayer): IntegrityAction | null {
  if (!transfer.apiFootballPlayerId || transfer.apiFootballPlayerId !== player.apiFootballId) return null;
  if (!transfer.sourceTeamApiFootballId || transfer.sourceTeamApiFootballId !== player.teamApiFootballId) return null;
  return { playerId: player.id, kind: movementKind(transfer.transferTypeEn), destinationNameHe: transfer.destinationTeamNameHe || undefined, effectiveDate: transfer.transferDate?.toISOString().slice(0, 10), sourceUrl: transfer.sourceUrl || undefined, confidence: 'VERIFIED', reason: 'API-Football player and source club identifiers match' };
}

export function buildIntegrityReport(input: { players: IntegrityPlayer[]; transfers: IntegrityTransfer[] }): IntegrityReport {
  const verified = input.transfers.flatMap((transfer) => input.players.map((player) => classifyTransfer(transfer, player)).filter((action): action is IntegrityAction => Boolean(action)));
  const roots = input.players.filter((player) => !player.canonicalPlayerId);
  const duplicates: IntegrityReport['duplicates'] = [];
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    const confidence = scoreDuplicateCandidate(roots[i], roots[j]);
    if (confidence === 'VERIFIED' || normalized(roots[i].nameEn) === normalized(roots[j].nameEn)) duplicates.push({ leftPlayerId: roots[i].id, rightPlayerId: roots[j].id, confidence });
  }
  return { verified, review: [], duplicates };
}

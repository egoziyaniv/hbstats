/** Read-only candidate discovery. Confidence is evidence for review, never permission to merge. */
export type DuplicatePlayer = {
  id: string; teamId: string; nameHe: string; nameEn: string;
  birthDate?: Date | string | null; apiFootballId?: number | null;
  canonicalPlayerId?: string | null; additionalInfo?: unknown;
};
export type DuplicateCandidate = {
  leftPlayerId: string; rightPlayerId: string; leftFamilyId: string; rightFamilyId: string;
  confidence: 'VERIFIED' | 'REVIEW'; reasons: string[]; conflicts: string[];
};
const normalize = (name: string) => name.normalize('NFKC').replace(/[.'’`"׳״־-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokens = (name: string) => normalize(name).split(' ').filter(Boolean).sort().join(' ');
const fullName = (name: string) => {
  const parts = normalize(name).split(' ');
  return parts.length >= 2 && parts.every(part => part.length > 1);
};
function day(value: DuplicatePlayer['birthDate']) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function playerSourceIds(player: DuplicatePlayer): Record<string, string | null> {
  const info = record(player.additionalInfo), flashscore = record(info.flashscore);
  const id = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0) || (typeof value === 'string' && value.trim()) ? String(value).trim() : null;
  return { API_FOOTBALL_ID: id(player.apiFootballId), SOFASCORE_ID: id(info.sofascoreId), FLASHSCORE_ID: id(flashscore.playerKey) };
}
export function buildDuplicateCandidates(players: DuplicatePlayer[]): DuplicateCandidate[] {
  // Compare only records sharing a squad or a supplier ID. Name equality across
  // unrelated teams is too broad and must not create a quadratic global scan.
  const buckets = new Map<string, DuplicatePlayer[]>();
  for (const player of players) {
    const keys = [`team:${player.teamId}`, ...Object.entries(playerSourceIds(player)).filter(([, id]) => id).map(([source, id]) => `${source}:${id}`)];
    for (const key of keys) { const bucket = buckets.get(key) || []; bucket.push(player); buckets.set(key, bucket); }
  }
  const seenRows = new Set<string>(), candidates = new Map<string, DuplicateCandidate>();
  for (const bucket of buckets.values()) for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
    const [left, right] = [bucket[i], bucket[j]].sort((a, b) => a.id.localeCompare(b.id));
    const rowKey = JSON.stringify([left.id, right.id]);
    if (seenRows.has(rowKey)) continue;
    seenRows.add(rowKey);
    const leftFamilyId = left.canonicalPlayerId || left.id, rightFamilyId = right.canonicalPlayerId || right.id;
    if (leftFamilyId === rightFamilyId) continue;
    const reasons: string[] = [], conflicts: string[] = [];
    const leftIds = playerSourceIds(left), rightIds = playerSourceIds(right);
    for (const source of Object.keys(leftIds)) {
      if (leftIds[source] && rightIds[source]) {
        if (leftIds[source] === rightIds[source]) reasons.push(source);
        else conflicts.push(source);
      }
    }
    const matchingName = (['nameHe', 'nameEn'] as const).some(field => normalize(left[field]) && tokens(left[field]) === tokens(right[field]));
    if (left.teamId === right.teamId && matchingName) reasons.push('NAME');
    if (!reasons.length) continue;
    const ld = day(left.birthDate), rd = day(right.birthDate);
    if (ld && rd && ld !== rd) conflicts.push('BIRTH_DATE');
    const exactFullName = (['nameHe', 'nameEn'] as const).some(field => fullName(left[field]) && normalize(left[field]) === normalize(right[field]));
    if (ld && ld === rd && exactFullName) reasons.push('FULL_NAME_AND_BIRTH_DATE');
    const confidence = !conflicts.length && reasons.some(reason => reason !== 'NAME') ? 'VERIFIED' : 'REVIEW';
    const key = JSON.stringify([leftFamilyId, rightFamilyId].sort());
    const previous = candidates.get(key);
    if (previous) {
      previous.reasons = [...new Set([...previous.reasons, ...reasons])];
      previous.conflicts = [...new Set([...previous.conflicts, ...conflicts])];
      previous.confidence = !previous.conflicts.length && (previous.confidence === 'VERIFIED' || confidence === 'VERIFIED') ? 'VERIFIED' : 'REVIEW';
    } else candidates.set(key, { leftPlayerId: left.id, rightPlayerId: right.id, leftFamilyId, rightFamilyId, confidence, reasons, conflicts });
  }
  return [...candidates.values()].sort((a, b) => a.confidence.localeCompare(b.confidence) || a.leftPlayerId.localeCompare(b.leftPlayerId));
}

import { canRepairFamilyLink, canonicalFamilyId, groupRosterFamilyRows } from '@/lib/canonical-player-family';

const row = (id: string, patch: Record<string, unknown> = {}) => ({
  id, canonicalPlayerId: null, updatedAt: new Date('2026-09-29T10:00:00.000Z'),
  nameHe: 'נועם בן הרוש', nameEn: 'Noam Ben Harosh', birthDate: new Date('2005-05-13'), apiFootballId: null, additionalInfo: null,
  team: { nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
  rosterStatus: { kind: 'LOAN' as const, updatedAt: '2026-09-29T10:00:00.000Z' }, ...patch,
});

test('self link is its own family rather than a valid child link', () => {
  expect(canonicalFamilyId(row('source', { canonicalPlayerId: 'source' }))).toBe('source');
});

test('groups linked statuses and retains the newest status source', () => {
  const groups = groupRosterFamilyRows([row('root'), row('old', { canonicalPlayerId: 'root', rosterStatus: { kind: 'LOAN', updatedAt: '2026-09-28T10:00:00.000Z' } })]);
  expect(groups).toHaveLength(1);
  expect(groups[0].statusSource.id).toBe('root');
});

test('allows only a self-linked source to attach to a root with exact name and date of birth', () => {
  expect(canRepairFamilyLink(row('source', { canonicalPlayerId: 'source' }), row('root'))).toBe(true);
  expect(canRepairFamilyLink(row('source', { canonicalPlayerId: 'source', birthDate: new Date('2004-01-01') }), row('root'))).toBe(false);
});

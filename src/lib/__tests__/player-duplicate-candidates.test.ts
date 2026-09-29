import { buildDuplicateCandidates } from '@/lib/player-duplicate-candidates';
const p = (id: string, patch: Record<string, unknown> = {}) => ({ id, teamId: 't', nameHe: 'אור דדיה', nameEn: 'Or Dadia', birthDate: null, canonicalPlayerId: null, apiFootballId: null, additionalInfo: null, ...patch });
test('keeps children when comparing different families but suppresses same-family records', () => {
  expect(buildDuplicateCandidates([p('a', { canonicalPlayerId: 'root' }), p('b', { canonicalPlayerId: 'root' })])).toHaveLength(0);
  expect(buildDuplicateCandidates([p('a', { canonicalPlayerId: 'root' }), p('b')])).toHaveLength(1);
});
test('blank names and dates never identify players', () => {
  expect(buildDuplicateCandidates([p('a', { nameHe: '', nameEn: '' }), p('b', { nameHe: '', nameEn: '' })])).toHaveLength(0);
});
test('name-only or reversed Hebrew names require review', () => {
  expect(buildDuplicateCandidates([p('a'), p('b', { nameHe: 'דדיה אור', nameEn: '' })])[0]).toMatchObject({ confidence: 'REVIEW' });
});
test('matching provider IDs support a candidate across differently spelled rows', () => {
  const rows = buildDuplicateCandidates([p('a', { additionalInfo: { sofascoreId: 99 } }), p('b', { nameHe: 'א. דדיה', nameEn: 'Dadia', additionalInfo: { sofascoreId: 99 } })]);
  expect(rows[0]).toMatchObject({ confidence: 'VERIFIED', reasons: expect.arrayContaining(['SOFASCORE_ID']) });
});
test('conflicting dates override a matching API identity', () => {
  expect(buildDuplicateCandidates([p('a', { apiFootballId: 1, birthDate: '1997-01-01' }), p('b', { apiFootballId: 1, birthDate: '1998-01-01' })])[0]).toMatchObject({ confidence: 'REVIEW', conflicts: ['BIRTH_DATE'] });
});
test('identical full names and DOB are verified but initials are not', () => {
  expect(buildDuplicateCandidates([p('a', { birthDate: '1997-01-01' }), p('b', { birthDate: '1997-01-01' })])[0].confidence).toBe('VERIFIED');
  expect(buildDuplicateCandidates([p('a', { nameHe: '', nameEn: 'O. Dadia', birthDate: '1997-01-01' }), p('b', { nameHe: '', nameEn: 'O. Dadia', birthDate: '1997-01-01' })])[0].confidence).toBe('REVIEW');
});
test('name-only matches across different squads are not duplicate squad rows', () => {
  expect(buildDuplicateCandidates([p('a'), p('b', { teamId: 'other' })])).toHaveLength(0);
});
test('one family pair appears once even if each has multiple entries', () => {
  expect(buildDuplicateCandidates([p('a'), p('a2', { canonicalPlayerId: 'a' }), p('b'), p('b2', { canonicalPlayerId: 'b' })])).toHaveLength(1);
});

test('a self-linked source remains a separate repair family', () => {
  const rows = buildDuplicateCandidates([p('source', { canonicalPlayerId: 'source', birthDate: '1997-01-01' }), p('root', { birthDate: '1997-01-01' })]);
  expect(rows).toHaveLength(1);
});
test('different nonempty source IDs are flagged even when names agree', () => {
  expect(buildDuplicateCandidates([p('a', { apiFootballId: 1 }), p('b', { apiFootballId: 2 })])[0].conflicts).toContain('API_FOOTBALL_ID');
});

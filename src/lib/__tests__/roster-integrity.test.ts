import { buildIntegrityReport, classifyTransfer, scoreDuplicateCandidate } from '@/lib/roster-integrity';

test('classifies verified outgoing loan by matching API player and source club', () => {
  expect(classifyTransfer(
    { apiFootballPlayerId: 7, sourceTeamApiFootballId: 1, destinationTeamNameHe: 'מ.ס. אשדוד', transferDate: new Date('2026-09-20'), transferTypeEn: 'Loan' },
    { id: 'p1', apiFootballId: 7, teamApiFootballId: 1 },
  )).toMatchObject({ kind: 'LOAN', confidence: 'VERIFIED', destinationNameHe: 'מ.ס. אשדוד' });
});

test('does not classify a player when the transfer source is another club', () => {
  expect(classifyTransfer(
    { apiFootballPlayerId: 7, sourceTeamApiFootballId: 2, destinationTeamNameHe: 'מ.ס. אשדוד', transferDate: new Date('2026-09-20'), transferTypeEn: 'Loan' },
    { id: 'p1', apiFootballId: 7, teamApiFootballId: 1 },
  )).toBeNull();
});

test('only marks duplicate families verified with shared API id or exact name and birth date', () => {
  expect(scoreDuplicateCandidate({ nameEn: 'A. Cohen' }, { nameEn: 'A. Cohen' })).toBe('REVIEW');
  expect(scoreDuplicateCandidate({ apiFootballId: 3 }, { apiFootballId: 3 })).toBe('VERIFIED');
  expect(scoreDuplicateCandidate({ nameEn: 'Or Dadia', birthDate: '1997-07-12' }, { nameEn: 'Or Dadia', birthDate: '1997-07-12' })).toBe('VERIFIED');
});

test('separates verified actions from review-only duplicate candidates', () => {
  const report = buildIntegrityReport({
    players: [{ id: 'p1', nameHe: 'איתי חזות', nameEn: 'Itay Hazut', apiFootballId: 7, teamApiFootballId: 1, canonicalPlayerId: null }],
    transfers: [{ apiFootballPlayerId: 7, sourceTeamApiFootballId: 1, destinationTeamNameHe: 'מ.ס. אשדוד', transferDate: new Date('2026-09-20'), transferTypeEn: 'Loan' }],
  });
  expect(report.verified).toHaveLength(1);
  expect(report.review).toHaveLength(0);
});

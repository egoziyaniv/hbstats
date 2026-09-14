import {
  SeasonDossierValidationError,
  parseDossierInput,
  parseMomentInput,
  parseSourceInput,
} from '@/lib/season-dossier-validation';

function expectInvalid(fn: () => unknown, message: string) {
  expect(fn).toThrow(SeasonDossierValidationError);
  expect(fn).toThrow(message);
}

describe('season dossier validation', () => {
  it('trims dossier text and normalizes empty optional values', () => {
    expect(parseDossierInput({ introHe: ' פתיח ', summaryHe: '', heroImageUrl: ' ' }))
      .toEqual({ introHe: 'פתיח', summaryHe: null, heroImageUrl: null, isPublished: false });
  });

  it('enforces dossier limits and safe image URLs', () => {
    expectInvalid(() => parseDossierInput({ introHe: 'א'.repeat(1001) }), '1,000');
    expectInvalid(() => parseDossierInput({ summaryHe: 'א'.repeat(4001) }), '4,000');
    expectInvalid(() => parseDossierInput({ heroImageUrl: 'javascript:alert(1)' }), 'HTTP');
    expect(parseDossierInput({ heroImageUrl: '/uploads/seasons/cover.jpg' }).heroImageUrl).toBe('/uploads/seasons/cover.jpg');
  });

  it('parses strict moment data and limits', () => {
    expect(parseMomentInput({
      eventDate: '2026-08-17T18:00:00.000Z', titleHe: ' משחק פתיחה ', bodyHe: ' ניצחון ',
      gameId: '', imageUrl: 'https://images.example.test/a.jpg', displayOrder: 2, isPublished: true,
    })).toEqual({
      eventDate: new Date('2026-08-17T18:00:00.000Z'), titleHe: 'משחק פתיחה', bodyHe: 'ניצחון',
      gameId: null, mediaAssetId: null, imageUrl: 'https://images.example.test/a.jpg', displayOrder: 2,
      isPublished: true,
    });
    expectInvalid(() => parseMomentInput({ eventDate: '17/08/2026', titleHe: 'x', bodyHe: 'y' }), 'תאריך');
    expectInvalid(() => parseMomentInput({ eventDate: '2026-08-17', titleHe: 'א'.repeat(161), bodyHe: 'y' }), '160');
    expectInvalid(() => parseMomentInput({ eventDate: '2026-08-17', titleHe: 'x', bodyHe: 'א'.repeat(2001) }), '2,000');
  });

  it('accepts only absolute HTTP(S) source URLs and validates ranges', () => {
    expect(parseSourceInput({
      labelHe: ' ההתאחדות ', provider: ' IFA ', url: 'https://football.org.il/match/1',
      scope: 'BOTH', competitionId: '', momentId: '', coverageStatus: 'COMPLETE',
      coverageFrom: '2026-07-01', coverageTo: '2027-06-30', verifiedAt: '2027-06-30', noteHe: '',
    })).toMatchObject({
      labelHe: 'ההתאחדות', provider: 'IFA', scope: 'BOTH', competitionId: null,
      momentId: null, coverageStatus: 'COMPLETE', noteHe: null,
    });
    expectInvalid(() => parseSourceInput({ labelHe: 'x', provider: 'y', url: '/relative' }), 'HTTP');
    expectInvalid(() => parseSourceInput({ labelHe: 'x', provider: 'y', url: 'ftp://x.test/a' }), 'HTTP');
    expectInvalid(() => parseSourceInput({
      labelHe: 'x', provider: 'y', url: 'https://x.test', coverageFrom: '2027-01-01', coverageTo: '2026-01-01',
    }), 'טווח');
    expectInvalid(() => parseSourceInput({ labelHe: 'א'.repeat(161), provider: 'y', url: 'https://x.test' }), '160');
    expectInvalid(() => parseSourceInput({ labelHe: 'x', provider: 'y', url: 'https://x.test', noteHe: 'א'.repeat(1001) }), '1,000');
  });
});

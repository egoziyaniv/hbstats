import { normalizeAppliedFields, rowMatchesAppliedFields } from '@/lib/merge-rollback-safety';

describe('merge rollback safety helpers', () => {
  test('keeps direct persisted values', () => {
    expect(normalizeAppliedFields({ goals: 4, venue: null })).toEqual({ goals: 4, venue: null });
  });

  test('unwraps preview-shaped values and ignores metadata fields', () => {
    expect(normalizeAppliedFields({
      goals: { old: 2, new: 4 },
      nameHe: { new: 'שם' },
      _events: { new: true },
    })).toEqual({ goals: 4, nameHe: 'שם' });
  });

  test('compares dates and nullable values across Prisma and JSON representations', () => {
    expect(rowMatchesAppliedFields(
      { dateTime: new Date('2025-08-30T17:00:00.000Z'), venueNameHe: null },
      { dateTime: '2025-08-30T17:00:00.000Z', venueNameHe: null },
    )).toBe(true);
  });

  test('detects a later edit in a field written by the merge', () => {
    expect(rowMatchesAppliedFields(
      { goals: 5, starts: 10 },
      { goals: 4 },
    )).toBe(false);
  });

  test('ignores fields that the merge did not write', () => {
    expect(rowMatchesAppliedFields(
      { goals: 4, updatedAt: new Date() },
      { goals: 4 },
    )).toBe(true);
  });
});

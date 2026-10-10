import { applyMissingFields, choosePrimaryPlayer, COPYABLE_FIELDS } from '@/lib/player-manual-merge';

const player = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  canonicalPlayerId: null,
  updatedAt: new Date('2026-09-29T10:00:00.000Z'),
  birthDate: null,
  position: null,
  nationalityEn: null,
  nationalityHe: null,
  photoUrl: null,
  firstNameEn: null,
  firstNameHe: null,
  lastNameEn: null,
  lastNameHe: null,
  _count: { events: 0, lineupEntries: 0 },
  ...patch,
});

it('chooses the record with the most historical game data as primary', () => {
  expect(choosePrimaryPlayer(player('empty'), player('played', { _count: { events: 3, lineupEntries: 5 } }))).toBe('played');
});

it('copies only selected fields that are empty on the primary record', () => {
  const primary = player('primary', { position: 'Defender' });
  const secondary = player('secondary', { birthDate: new Date('2004-03-26'), position: 'Midfielder', nationalityHe: 'ישראל' });
  expect(applyMissingFields(primary, secondary, ['birthDate', 'position', 'nationalityHe'])).toEqual({
    birthDate: new Date('2004-03-26'),
    nationalityHe: 'ישראל',
  });
});

it('exports the fixed allowlist used by server validation', () => {
  expect(COPYABLE_FIELDS).toContain('birthDate');
  expect(COPYABLE_FIELDS).not.toContain('apiFootballId');
});

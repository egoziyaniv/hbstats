export const COPYABLE_FIELDS = [
  'birthDate',
  'position',
  'nationalityEn',
  'nationalityHe',
  'photoUrl',
  'firstNameEn',
  'firstNameHe',
  'lastNameEn',
  'lastNameHe',
] as const;

export type CopyablePlayerField = (typeof COPYABLE_FIELDS)[number];

export type ManualMergePlayer = {
  id: string;
  canonicalPlayerId: string | null;
  updatedAt: Date;
  birthDate: Date | null;
  position: string | null;
  nationalityEn: string | null;
  nationalityHe: string | null;
  photoUrl: string | null;
  firstNameEn: string | null;
  firstNameHe: string | null;
  lastNameEn: string | null;
  lastNameHe: string | null;
  _count: { events: number; lineupEntries: number };
};

function isEmpty(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

export function choosePrimaryPlayer(left: ManualMergePlayer, right: ManualMergePlayer) {
  const volume = (player: ManualMergePlayer) => player._count.events + player._count.lineupEntries;
  const leftVolume = volume(left);
  const rightVolume = volume(right);
  if (leftVolume !== rightVolume) return leftVolume > rightVolume ? left.id : right.id;
  return left.id.localeCompare(right.id) <= 0 ? left.id : right.id;
}

export function applyMissingFields(
  primary: ManualMergePlayer,
  secondary: ManualMergePlayer,
  fields: CopyablePlayerField[],
) {
  return Object.fromEntries(
    fields
      .filter((field) => isEmpty(primary[field]) && !isEmpty(secondary[field]))
      .map((field) => [field, secondary[field]]),
  ) as Partial<Pick<ManualMergePlayer, CopyablePlayerField>>;
}

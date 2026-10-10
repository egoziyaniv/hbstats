import type { RosterStatus } from '@/lib/roster-status';

export type FamilyIdentityPlayer = {
  id: string;
  canonicalPlayerId?: string | null;
  nameHe?: string | null;
  nameEn?: string | null;
  birthDate?: Date | string | null;
  apiFootballId?: number | null;
  additionalInfo?: unknown;
};

export type RosterFamilyPlayer = FamilyIdentityPlayer & {
  updatedAt: Date;
  rosterStatus: RosterStatus;
  team: { nameHe: string | null; nameEn: string | null };
};

const normalize = (value?: string | null) => value?.normalize('NFKC').replace(/[.'’`"׳״־-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() || '';
const day = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function canonicalFamilyId(player: Pick<FamilyIdentityPlayer, 'id' | 'canonicalPlayerId'>) {
  return player.canonicalPlayerId && player.canonicalPlayerId !== player.id ? player.canonicalPlayerId : player.id;
}

function sourceIds(player: FamilyIdentityPlayer): Record<string, string | null> {
  const info = record(player.additionalInfo);
  const flashscore = record(info.flashscore);
  const id = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0) || (typeof value === 'string' && value.trim()) ? String(value).trim() : null;
  return { API_FOOTBALL_ID: id(player.apiFootballId), SOFASCORE_ID: id(info.sofascoreId), FLASHSCORE_ID: id(flashscore.playerKey) };
}

function sameFullName(left: FamilyIdentityPlayer, right: FamilyIdentityPlayer) {
  return (['nameHe', 'nameEn'] as const).some((field) => {
    const leftName = normalize(left[field]);
    const rightName = normalize(right[field]);
    return leftName.split(' ').filter(Boolean).length >= 2 && leftName === rightName;
  });
}

function hasIdentityConflict(left: FamilyIdentityPlayer, right: FamilyIdentityPlayer) {
  const leftIds = sourceIds(left);
  const rightIds = sourceIds(right);
  if (Object.keys(leftIds).some((source) => leftIds[source] && rightIds[source] && leftIds[source] !== rightIds[source])) return true;
  const leftDate = day(left.birthDate);
  const rightDate = day(right.birthDate);
  return Boolean(leftDate && rightDate && leftDate !== rightDate);
}

export function canRepairFamilyLink(source: FamilyIdentityPlayer, target: FamilyIdentityPlayer) {
  if (source.id === target.id || source.canonicalPlayerId !== source.id || target.canonicalPlayerId || hasIdentityConflict(source, target)) return false;
  const sourceProviderIds = sourceIds(source);
  const targetProviderIds = sourceIds(target);
  const sharedProvider = Object.keys(sourceProviderIds).some((key) => sourceProviderIds[key] && sourceProviderIds[key] === targetProviderIds[key]);
  const sourceDate = day(source.birthDate);
  const targetDate = day(target.birthDate);
  return sharedProvider || Boolean(sourceDate && sourceDate === targetDate && sameFullName(source, target));
}

function statusTime(player: RosterFamilyPlayer) {
  const parsed = player.rosterStatus.updatedAt ? new Date(player.rosterStatus.updatedAt) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.getTime() : player.updatedAt.getTime();
}

export function groupRosterFamilyRows(players: RosterFamilyPlayer[]) {
  const grouped = new Map<string, RosterFamilyPlayer[]>();
  for (const player of players) {
    const familyId = canonicalFamilyId(player);
    const aliases = grouped.get(familyId) || [];
    aliases.push(player);
    grouped.set(familyId, aliases);
  }
  return [...grouped.entries()].map(([familyId, aliases]) => {
    const statusSource = [...aliases].sort((left, right) => statusTime(right) - statusTime(left) || left.id.localeCompare(right.id))[0];
    return { familyId, aliases, displayPlayer: aliases.find((player) => player.id === familyId) || statusSource, statusSource, rosterStatus: statusSource.rosterStatus };
  }).sort((left, right) => left.displayPlayer.id.localeCompare(right.displayPlayer.id));
}

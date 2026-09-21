export type RosterStatusKind = 'DEPARTED' | 'SOLD' | 'LOAN';

export type RosterStatus = {
  kind: RosterStatusKind;
  destinationNameHe?: string;
  effectiveDate?: string;
  sourceUrl?: string;
  /** False when a stale supplier row never belonged to this season's squad. */
  showInSquadArchive?: boolean;
};

type PlayerInfo = { departed?: boolean; rosterStatus?: RosterStatus } | null | undefined;

export function getRosterStatus(additionalInfo: unknown): RosterStatus | null {
  if (!additionalInfo || typeof additionalInfo !== 'object') return null;
  const info = additionalInfo as PlayerInfo;
  const status = info?.rosterStatus;
  if (status && ['DEPARTED', 'SOLD', 'LOAN'].includes(status.kind)) return status;
  return info?.departed ? { kind: 'DEPARTED' } : null;
}

export function isInactiveRosterPlayer(additionalInfo: unknown) {
  return getRosterStatus(additionalInfo) !== null;
}

export function formatRosterStatus(status: RosterStatus | null) {
  if (!status) return null;
  if (status.kind === 'LOAN') return status.destinationNameHe ? `מושאל ל־${status.destinationNameHe}` : 'מושאל';
  if (status.kind === 'SOLD') return status.destinationNameHe ? `נמכר ל־${status.destinationNameHe}` : 'נמכר';
  return status.destinationNameHe ? `עזב ל־${status.destinationNameHe}` : 'עזב את הקבוצה';
}

export class SeasonDossierValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeasonDossierValidationError';
  }
}

type JsonRecord = Record<string, unknown>;

export type DossierInput = {
  introHe: string | null;
  summaryHe: string | null;
  heroImageUrl: string | null;
  isPublished: boolean;
};

export type MomentInput = {
  eventDate: Date;
  titleHe: string;
  bodyHe: string;
  gameId: string | null;
  mediaAssetId: string | null;
  imageUrl: string | null;
  displayOrder: number;
  isPublished: boolean;
};

export type SourceInput = {
  momentId: string | null;
  labelHe: string;
  provider: string;
  url: string;
  scope: 'METRICS' | 'EDITORIAL' | 'BOTH';
  competitionId: string | null;
  coverageStatus: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
  coverageFrom: Date | null;
  coverageTo: Date | null;
  verifiedAt: Date | null;
  noteHe: string | null;
};

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SeasonDossierValidationError('גוף הבקשה אינו תקין');
  }
  return value as JsonRecord;
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) throw new SeasonDossierValidationError(`${field} הוא שדה חובה`);
    return null;
  }
  if (typeof value !== 'string') throw new SeasonDossierValidationError(`${field} חייב להיות טקסט`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new SeasonDossierValidationError(`${field} הוא שדה חובה`);
    return null;
  }
  if ([...trimmed].length > max) {
    throw new SeasonDossierValidationError(`${field} מוגבל ל־${max.toLocaleString('en-US')} תווים`);
  }
  return trimmed;
}

function httpUrl(value: unknown, field: string, required = false): string | null {
  const parsedText = text(value, field, 2_048, required);
  if (!parsedText) return null;
  try {
    const parsed = new URL(parsedText);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) throw new Error();
    return parsed.toString();
  } catch {
    throw new SeasonDossierValidationError(`${field} חייב להיות קישור HTTP או HTTPS מלא`);
  }
}

function mediaUrl(value: unknown, field: string): string | null {
  const parsedText = text(value, field, 2_048);
  if (!parsedText) return null;
  if (parsedText.startsWith('/') && !parsedText.startsWith('//')) return parsedText;
  return httpUrl(parsedText, field);
}

function date(value: unknown, field: string, required = false): Date | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new SeasonDossierValidationError(`${field} הוא שדה חובה`);
    return null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new SeasonDossierValidationError(`${field} חייב להיות תאריך ISO תקין`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new SeasonDossierValidationError(`${field} חייב להיות תאריך ISO תקין`);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new SeasonDossierValidationError(`${field} חייב להיות תאריך ISO תקין`);
  }
  return parsed;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new SeasonDossierValidationError('ערך כן/לא אינו תקין');
  return value;
}

function integer(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new SeasonDossierValidationError('סדר התצוגה חייב להיות מספר שלם');
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  field: string,
): T[number] {
  const normalized = value ?? fallback;
  if (typeof normalized !== 'string' || !allowed.includes(normalized)) {
    throw new SeasonDossierValidationError(`${field} אינו תקין`);
  }
  return normalized as T[number];
}

export function parseDossierInput(value: unknown): DossierInput {
  const body = record(value);
  return {
    introHe: text(body.introHe, 'פתיח', 1_000),
    summaryHe: text(body.summaryHe, 'סיכום', 4_000),
    heroImageUrl: mediaUrl(body.heroImageUrl, 'תמונת שער'),
    isPublished: boolean(body.isPublished, false),
  };
}

export function parseMomentInput(value: unknown): MomentInput {
  const body = record(value);
  return {
    eventDate: date(body.eventDate, 'תאריך האירוע', true)!,
    titleHe: text(body.titleHe, 'כותרת הרגע', 160, true)!,
    bodyHe: text(body.bodyHe, 'תיאור הרגע', 2_000, true)!,
    gameId: text(body.gameId, 'משחק', 128),
    mediaAssetId: text(body.mediaAssetId, 'מדיה', 128),
    imageUrl: mediaUrl(body.imageUrl, 'תמונת הרגע'),
    displayOrder: integer(body.displayOrder),
    isPublished: boolean(body.isPublished, true),
  };
}

export function parseSourceInput(value: unknown): SourceInput {
  const body = record(value);
  const coverageFrom = date(body.coverageFrom, 'תחילת הכיסוי');
  const coverageTo = date(body.coverageTo, 'סיום הכיסוי');
  const verifiedAt = date(body.verifiedAt, 'מועד האימות');
  const coverageStatus = enumValue(
    body.coverageStatus,
    ['COMPLETE', 'PARTIAL', 'UNKNOWN'] as const,
    'UNKNOWN',
    'מצב הכיסוי',
  );
  if (coverageFrom && coverageTo && coverageFrom.getTime() > coverageTo.getTime()) {
    throw new SeasonDossierValidationError('טווח הכיסוי אינו תקין');
  }
  if (coverageStatus === 'COMPLETE' && (!coverageFrom || !coverageTo || !verifiedAt)) {
    throw new SeasonDossierValidationError('מקור בכיסוי מלא דורש טווח ומועד אימות');
  }
  if (verifiedAt && coverageTo && verifiedAt.getTime() < coverageTo.getTime()) {
    throw new SeasonDossierValidationError('מועד האימות חייב להיות לאחר סיום טווח הכיסוי');
  }
  return {
    momentId: text(body.momentId, 'רגע', 128),
    labelHe: text(body.labelHe, 'תווית המקור', 160, true)!,
    provider: text(body.provider, 'ספק המקור', 160, true)!,
    url: httpUrl(body.url, 'קישור המקור', true)!,
    scope: enumValue(body.scope, ['METRICS', 'EDITORIAL', 'BOTH'] as const, 'EDITORIAL', 'תחום המקור'),
    competitionId: text(body.competitionId, 'מסגרת', 128),
    coverageStatus,
    coverageFrom,
    coverageTo,
    verifiedAt,
    noteHe: text(body.noteHe, 'הערת מקור', 1_000),
  };
}

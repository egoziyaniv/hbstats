import type { Prisma } from '@prisma/client';

export const ARCHIVE_TYPES = { MEMORY: 'זיכרון', PHOTO: 'תמונה', TICKET: 'כרטיס', PROGRAMME: 'תוכנייה', OTHER: 'פריט אחר' } as const;
export const ARCHIVE_STATUSES = { DRAFT: 'טיוטה פרטית', PENDING: 'ממתין לבדיקה', PUBLISHED: 'פורסם', REJECTED: 'דרוש תיקון' } as const;
export class ArchiveValidationError extends Error {}

type RecordInput = Record<string, unknown>;
function record(value: unknown): RecordInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ArchiveValidationError('בקשה לא תקינה');
  return value as RecordInput;
}
function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new ArchiveValidationError(`יש למלא ${label}`);
    return null;
  }
  if (typeof value !== 'string') throw new ArchiveValidationError(`${label} אינו תקין`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ArchiveValidationError(`יש למלא ${label}`);
  if ([...trimmed].length > max) throw new ArchiveValidationError(`${label}: עד ${max} תווים`);
  return trimmed || null;
}
function url(value: unknown, label: string): string | null {
  const raw = text(value, label, 2048);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch { throw new ArchiveValidationError(`${label}: יש להזין קישור HTTP או HTTPS תקין ללא פרטי כניסה`); }
}
function id(value: unknown): string | null {
  const result = text(value, 'מזהה קישור', 80);
  if (result && !/^[a-zA-Z0-9_-]+$/.test(result)) throw new ArchiveValidationError('מזהה קישור אינו תקין');
  return result;
}

export function parseArchiveInput(value: unknown) {
  const body = record(value);
  if (body.action !== 'submit' && body.action !== 'draft') throw new ArchiveValidationError('יש לבחור שמירה או שליחה לבדיקה');
  if (typeof body.type !== 'string' || !Object.prototype.hasOwnProperty.call(ARCHIVE_TYPES, body.type)) throw new ArchiveValidationError('סוג הפריט אינו תקין');
  if (body.permissionGranted !== undefined && typeof body.permissionGranted !== 'boolean') throw new ArchiveValidationError('אישור ההרשאה אינו תקין');
  const permissionGranted = body.permissionGranted === true;
  if (body.action === 'submit' && !permissionGranted) throw new ArchiveValidationError('נדרש אישור הרשאה לפרסום');
  const rawDate = text(body.eventDate, 'תאריך', 10);
  let eventDate: Date | null = null;
  if (rawDate) {
    eventDate = new Date(`${rawDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !Number.isFinite(eventDate.getTime()) || eventDate.toISOString().slice(0, 10) !== rawDate) throw new ArchiveValidationError('תאריך אינו תקין');
  }
  return {
    type: body.type as keyof typeof ARCHIVE_TYPES,
    titleHe: text(body.titleHe, 'כותרת', 160, true)!,
    bodyHe: text(body.bodyHe, 'סיפור הפריט', 8000, true)!,
    creditHe: text(body.creditHe, 'קרדיט', 120, true)!,
    eventDate,
    sourceUrl: url(body.sourceUrl, 'קישור למקור'),
    imageUrl: url(body.imageUrl, 'קישור לתמונה'),
    permissionGranted,
    gameId: id(body.gameId), seasonId: id(body.seasonId), playerId: id(body.playerId), venueId: id(body.venueId),
    status: body.action === 'submit' ? 'PENDING' as const : 'DRAFT' as const,
  };
}

export function parseArchiveReview(value: unknown) {
  const body = record(value);
  if (body.action !== 'publish' && body.action !== 'reject') throw new ArchiveValidationError('יש לבחור אישור או החזרה לתיקון');
  return { action: body.action, expectedUpdatedAt: text(body.expectedUpdatedAt, 'גרסת הפריט', 40), links: body.links === undefined ? undefined : { gameId: id(record(body.links).gameId), seasonId: id(record(body.links).seasonId), playerId: id(record(body.links).playerId), venueId: id(record(body.links).venueId) }, reviewNoteHe: text(body.reviewNoteHe, 'הסבר הבדיקה', 2000, body.action === 'reject') };
}

export function archiveReadWhere(id: string, viewer: { id: string; role: string } | null): Prisma.FanArchiveItemWhereInput {
  if (viewer?.role === 'ADMIN') return { id };
  if (viewer) return { id, OR: [{ status: 'PUBLISHED', permissionGranted: true }, { authorId: viewer.id }] };
  return { id, status: 'PUBLISHED', permissionGranted: true };
}
export const publicArchiveSelect = {
  id: true, type: true, titleHe: true, bodyHe: true, eventDate: true, creditHe: true,
  sourceUrl: true, imageUrl: true, gameId: true, seasonId: true, playerId: true, venueId: true, publishedAt: true,
} satisfies Prisma.FanArchiveItemSelect;

export async function validateArchiveLinks(tx: Prisma.TransactionClient, input: ReturnType<typeof parseArchiveInput>) {
  const [game, season, player, venue] = await Promise.all([
    input.gameId ? tx.game.findUnique({ where: { id: input.gameId }, select: { id: true, seasonId: true } }) : null,
    input.seasonId ? tx.season.findUnique({ where: { id: input.seasonId }, select: { id: true } }) : null,
    input.playerId ? tx.player.findUnique({ where: { id: input.playerId }, select: { id: true } }) : null,
    input.venueId ? tx.venue.findUnique({ where: { id: input.venueId }, select: { id: true } }) : null,
  ]);
  if ((input.gameId && !game) || (input.seasonId && !season) || (input.playerId && !player) || (input.venueId && !venue)) throw new ArchiveValidationError('אחד הקישורים למשחק, לעונה, לשחקן או לאצטדיון לא נמצא');
  if (game && input.seasonId && game.seasonId !== input.seasonId) throw new ArchiveValidationError('המשחק אינו שייך לעונה שנבחרה');
}

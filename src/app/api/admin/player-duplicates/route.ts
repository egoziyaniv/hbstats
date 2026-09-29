import { ActivityEntityType, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { applyMissingFields, COPYABLE_FIELDS, type CopyablePlayerField, type ManualMergePlayer } from '@/lib/player-manual-merge';
import { buildDuplicateCandidates } from '@/lib/player-duplicate-candidates';

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });
const exactTimestamp = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
};
const select = {
  id: true, teamId: true, nameHe: true, nameEn: true, canonicalPlayerId: true, updatedAt: true, birthDate: true,
  position: true, nationalityEn: true, nationalityHe: true, photoUrl: true, firstNameEn: true, firstNameHe: true,
  lastNameEn: true, lastNameHe: true, apiFootballId: true, additionalInfo: true,
  _count: { select: { events: true, lineupEntries: true } },
} as const;
type MergePlayer = Prisma.PlayerGetPayload<{ select: typeof select }>;
type MergeDetails = {
  type: 'MANUAL_PLAYER_MERGE'; primaryId: string; secondaryId: string; memberIds: string[];
  copiedBefore: Record<string, unknown>; previousCanonicalIds: Record<string, string | null>; undoneAt?: string;
};
const details = (value: unknown): MergeDetails | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.type !== 'MANUAL_PLAYER_MERGE' || typeof item.primaryId !== 'string' || typeof item.secondaryId !== 'string' || !Array.isArray(item.memberIds) || !item.memberIds.every((id) => typeof id === 'string') || !item.copiedBefore || typeof item.copiedBefore !== 'object' || !item.previousCanonicalIds || typeof item.previousCanonicalIds !== 'object') return null;
  return item as unknown as MergeDetails;
};
const isAllowedField = (field: unknown): field is CopyablePlayerField => typeof field === 'string' && (COPYABLE_FIELDS as readonly string[]).includes(field);
const rootsAreCandidate = (primary: MergePlayer, secondary: MergePlayer) => buildDuplicateCandidates([primary, secondary]).some((candidate) => candidate.leftPlayerId === primary.id && candidate.rightPlayerId === secondary.id || candidate.leftPlayerId === secondary.id && candidate.rightPlayerId === primary.id);

async function merge(body: Record<string, unknown>, userId: string) {
  const { primaryId, secondaryId } = body;
  const primaryTimestamp = exactTimestamp(body.expectedPrimaryUpdatedAt);
  const secondaryTimestamp = exactTimestamp(body.expectedSecondaryUpdatedAt);
  if (typeof primaryId !== 'string' || typeof secondaryId !== 'string' || !primaryId || !secondaryId || primaryId === secondaryId || !primaryTimestamp || !secondaryTimestamp || !Array.isArray(body.copyFields) || body.copyFields.some((field) => !isAllowedField(field)) || new Set(body.copyFields).size !== body.copyFields.length) return error('פרטי האיחוד אינם תקינים', 400);
  const copyFields = body.copyFields as CopyablePlayerField[];
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [primary, secondary] = await Promise.all([
        tx.player.findUnique({ where: { id: primaryId }, select }),
        tx.player.findUnique({ where: { id: secondaryId }, select }),
      ]);
      if (!primary || !secondary) throw new Error('NOT_FOUND');
      if (primary.updatedAt.getTime() !== primaryTimestamp.getTime() || secondary.updatedAt.getTime() !== secondaryTimestamp.getTime()) throw new Error('STALE');
      if (primary.canonicalPlayerId || secondary.canonicalPlayerId || primary.teamId !== secondary.teamId || !rootsAreCandidate(primary, secondary)) throw new Error('NOT_CANDIDATE');
      const family = await tx.player.findMany({ where: { OR: [{ id: secondary.id }, { canonicalPlayerId: secondary.id }] }, select: { id: true, canonicalPlayerId: true } });
      const members = family.some((member) => member.id === secondary.id) ? family : [{ id: secondary.id, canonicalPlayerId: secondary.canonicalPlayerId }, ...family];
      const copied = applyMissingFields(primary as ManualMergePlayer, secondary as ManualMergePlayer, copyFields);
      const copiedBefore = Object.fromEntries(Object.keys(copied).map((field) => [field, primary[field as keyof MergePlayer]]));
      if (Object.keys(copied).length) await tx.player.update({ where: { id: primary.id }, data: copied });
      await tx.player.updateMany({ where: { id: { in: members.map((member) => member.id) } }, data: { canonicalPlayerId: primary.id } });
      const mergeDetails = JSON.parse(JSON.stringify({
        type: 'MANUAL_PLAYER_MERGE', primaryId: primary.id, secondaryId: secondary.id, memberIds: members.map((member) => member.id),
        copiedBefore, previousCanonicalIds: Object.fromEntries(members.map((member) => [member.id, member.canonicalPlayerId])),
      })) as Prisma.InputJsonObject;
      const log = await tx.activityLog.create({ data: {
        entityType: ActivityEntityType.PLAYER, entityId: primary.id, userId, actionHe: 'איחוד שחקנים ידני',
        details: mergeDetails,
      } });
      return { mergeId: log.id, copiedFields: Object.keys(copied) };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : '';
    return error(code === 'NOT_FOUND' ? 'אחת הרשומות לא נמצאה' : code === 'STALE' ? 'אחת הרשומות השתנתה. יש לרענן ולנסות שוב' : code === 'NOT_CANDIDATE' ? 'הזוג אינו מועמד תקין לאיחוד' : 'שמירת האיחוד נכשלה', code === 'NOT_FOUND' ? 404 : code ? 409 : 500);
  }
}

async function undo(body: Record<string, unknown>, userId: string) {
  if (typeof body.mergeId !== 'string' || !body.mergeId) return error('מזהה האיחוד אינו תקין', 400);
  try {
    await prisma.$transaction(async (tx) => {
      const mergeId = body.mergeId as string;
      const log = await tx.activityLog.findUnique({ where: { id: mergeId } });
      const prior = log && details(log.details);
      if (!log || log.entityType !== ActivityEntityType.PLAYER || log.actionHe !== 'איחוד שחקנים ידני' || !prior || prior.undoneAt) throw new Error('NOT_UNDOABLE');
      const rows = await tx.player.findMany({ where: { id: { in: [prior.primaryId, ...prior.memberIds] } }, select: { id: true, canonicalPlayerId: true, updatedAt: true } });
      if (rows.length !== new Set([prior.primaryId, ...prior.memberIds]).size || rows.some((row) => row.updatedAt > log.timestamp)) throw new Error('STALE');
      const primary = rows.find((row) => row.id === prior.primaryId);
      if (!primary || rows.some((row) => row.id !== prior.primaryId && row.canonicalPlayerId !== prior.primaryId)) throw new Error('STALE');
      if (Object.keys(prior.copiedBefore).length) await tx.player.update({ where: { id: prior.primaryId }, data: prior.copiedBefore as Prisma.PlayerUpdateInput });
      for (const memberId of prior.memberIds) await tx.player.update({ where: { id: memberId }, data: { canonicalPlayerId: prior.previousCanonicalIds[memberId] ?? null } });
      await tx.activityLog.update({ where: { id: log.id }, data: { details: JSON.parse(JSON.stringify({ ...prior, undoneAt: new Date().toISOString() })) as Prisma.InputJsonObject } });
      await tx.activityLog.create({ data: { entityType: ActivityEntityType.PLAYER, entityId: prior.primaryId, userId, actionHe: 'בוטל איחוד שחקנים ידני', details: { mergeId: log.id } } });
    });
    return NextResponse.json({ success: true });
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : '';
    return error(code === 'NOT_UNDOABLE' ? 'לא ניתן לבטל איחוד זה' : code === 'STALE' ? 'האיחוד שונה לאחר ביצועו ולא ניתן לבטלו אוטומטית' : 'ביטול האיחוד נכשל', code ? 409 : 500);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== 'ADMIN') return error('אין הרשאה לביצוע הפעולה', 403);
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return error('בקשה לא תקינה', 400);
    body = parsed;
  } catch { return error('בקשה לא תקינה', 400); }
  if (body.action === 'merge') return merge(body, user.id);
  if (body.action === 'undo') return undo(body, user.id);
  return error('פעולה לא תקינה', 400);
}

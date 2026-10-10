import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getRosterStatus, RosterStatusKind, withRosterStatus } from '@/lib/roster-status';

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== 'ADMIN') return error('אין הרשאה לביצוע הפעולה', 403);
  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return error('בקשה לא תקינה', 400);
    body = value;
  } catch { return error('בקשה לא תקינה', 400); }
  const { playerId, action, expectedUpdatedAt, kind, destinationNameHe, effectiveDate } = body;
  if (typeof playerId !== 'string' || !playerId.trim() || typeof action !== 'string' || !['approve', 'update', 'reject'].includes(action)) return error('פעולה או שחקן לא תקינים', 400);
  if (typeof expectedUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt)) || new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt) return error('מועד עדכון לא תקין', 400);
  const hasEdits = action === 'update' || (action === 'approve' && [kind, destinationNameHe, effectiveDate].some((value) => value !== undefined));
  if (hasEdits) {
    if (typeof kind !== 'string' || !['DEPARTED', 'SOLD', 'LOAN'].includes(kind)) return error('סטטוס לא תקין', 400);
    if (destinationNameHe !== undefined && (typeof destinationNameHe !== 'string' || destinationNameHe.trim().length > 200)) return error('היעד מוגבל ל־200 תווים', 400);
    if (effectiveDate !== undefined && (typeof effectiveDate !== 'string' || (effectiveDate !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(Date.parse(effectiveDate)) || new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate)))) return error('תאריך לא תקין', 400);
  }
  try {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { additionalInfo: true, updatedAt: true } });
    if (!player) return error('השחקן לא נמצא', 404);
    if (player.updatedAt.toISOString() !== expectedUpdatedAt) return error('הרשומה השתנתה. יש לרענן ולנסות שוב', 409);
    const existing = getRosterStatus(player.additionalInfo);
    if (!existing) return error('אין שינוי סגל לבדיקה. יש לרענן את הרשימה', 409);
    let additionalInfo: Record<string, unknown>;
    if (action === 'reject') {
      additionalInfo = { ...(player.additionalInfo as Record<string, unknown>) };
      delete additionalInfo.rosterStatus;
      delete additionalInfo.departed;
    } else {
      const status = { ...existing, updatedAt: new Date().toISOString() };
      if (action === 'approve') status.confidence = 'VERIFIED';
      if (hasEdits) {
        status.kind = kind as RosterStatusKind;
        if (destinationNameHe !== undefined) {
          if ((destinationNameHe as string).trim()) status.destinationNameHe = (destinationNameHe as string).trim();
          else delete status.destinationNameHe;
        }
        if (effectiveDate !== undefined) {
          if (effectiveDate) status.effectiveDate = effectiveDate as string;
          else delete status.effectiveDate;
        }
      }
      additionalInfo = withRosterStatus(player.additionalInfo, status);
    }
    const result = await prisma.player.updateMany({ where: { id: playerId, updatedAt: new Date(expectedUpdatedAt) }, data: { additionalInfo: additionalInfo as Prisma.InputJsonObject } });
    if (result.count !== 1) return error('הרשומה השתנתה. יש לרענן ולנסות שוב', 409);
    return NextResponse.json({ success: true });
  } catch { return error('שמירת השינוי נכשלה', 500); }
}

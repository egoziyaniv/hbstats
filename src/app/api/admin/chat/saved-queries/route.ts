import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkSql, ensureParser } from '@/lib/chat-sql/guard';
import { runChatQuery } from '@/lib/chat-sql/run';

export const dynamic = 'force-dynamic';

type Body = {
  id?: string; titleHe?: string; intentHe?: string; sql?: string; answerHe?: string; enabled?: boolean;
  params?: Array<{ name: string; descriptionHe: string; example?: string }>;
  test?: boolean; values?: string[]; remove?: boolean;
};

async function admin(request: NextRequest) {
  const user = await getRequestUser(request);
  return user?.role === 'ADMIN';
}

/** Create, update, delete or test-run a saved query. */
export async function POST(request: NextRequest) {
  if (!(await admin(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Body;

  if (b.test) {
    const result = await runChatQuery(String(b.sql ?? ''), (b.values ?? []).map(String));
    return NextResponse.json({ result });
  }
  if (b.remove && b.id) {
    await prisma.chatSavedQuery.delete({ where: { id: b.id } });
    return NextResponse.json({ ok: true });
  }

  await ensureParser();
  const sql = String(b.sql ?? '').trim().replace(/;\s*$/, '');
  const check = checkSql(sql, { allowParams: true });
  if ('reason' in check) return NextResponse.json({ error: `השאילתה נדחתה: ${check.reason}` }, { status: 400 });
  if (!b.titleHe?.trim() || !b.intentHe?.trim()) return NextResponse.json({ error: 'חסרים כותרת ותיאור' }, { status: 400 });
  const params = (b.params ?? []).filter((p) => p.name?.trim()).map((p) => ({ name: p.name.trim(), descriptionHe: p.descriptionHe?.trim() ?? '', example: p.example?.trim() || undefined }));
  const data = {
    titleHe: b.titleHe.trim(), intentHe: b.intentHe.trim(), sql, answerHe: b.answerHe?.trim() ?? '',
    params: params as unknown as Prisma.InputJsonValue, enabled: b.enabled ?? true,
  };
  const row = b.id
    ? await prisma.chatSavedQuery.update({ where: { id: b.id }, data })
    : await prisma.chatSavedQuery.create({ data });
  return NextResponse.json({ saved: row });
}

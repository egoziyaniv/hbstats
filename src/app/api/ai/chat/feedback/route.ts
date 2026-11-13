import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

/** 👍/👎 on a chat answer — only by the user who asked the question. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'יש להתחבר' }, { status: 401 });
  const body = await request.json().catch(() => null) as { questionId?: unknown; value?: unknown } | null;
  const value = body?.value === 1 || body?.value === -1 ? body.value : null;
  if (typeof body?.questionId !== 'string' || value == null) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const r = await prisma.chatQuestion.updateMany({ where: { id: body.questionId, userId: user.id }, data: { feedback: value } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
}

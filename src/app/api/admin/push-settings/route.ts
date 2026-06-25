import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import {
  getPushCategoryFlags,
  setPushCategoryFlags,
  PUSH_CATEGORIES,
  type PushCategory,
} from '@/lib/push-settings';

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ flags: await getPushCategoryFlags() });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const incoming = (body && typeof body.flags === 'object' && body.flags) || body || {};
  const partial: Partial<Record<PushCategory, boolean>> = {};
  for (const c of PUSH_CATEGORIES) {
    if (typeof incoming[c] === 'boolean') partial[c] = incoming[c];
  }
  const flags = await setPushCategoryFlags(partial);
  return NextResponse.json({ ok: true, flags });
}

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { deleteUserAccount } from '@/lib/account';

const SESSION_COOKIE = 'hbs_session';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await deleteUserAccount(user.id);
  if (!result.ok) {
    const failResult = result as { ok: false; reason: 'not_found' | 'last_admin' };
    if (failResult.reason === 'last_admin') {
      return NextResponse.json(
        { error: 'לא ניתן למחוק את חשבון המנהל האחרון.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'החשבון לא נמצא.' }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

// src/app/api/mobile/v1/account/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { deleteUserAccount } from '@/lib/account';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await deleteUserAccount(user.id);
  if (!result.ok) {
    if ('reason' in result && result.reason === 'last_admin') {
      return NextResponse.json({ error: 'Cannot delete the last admin account.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

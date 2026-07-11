import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { rebuildAllRecords } from '@/lib/history/records-engine';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await rebuildAllRecords();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[admin/rebuild-records] failed:', err);
    return NextResponse.json({ error: 'Failed to rebuild records' }, { status: 500 });
  }
}

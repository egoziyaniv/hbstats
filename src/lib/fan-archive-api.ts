import { NextResponse } from 'next/server';
import { ArchiveValidationError } from './fan-archive';
export async function readArchiveJson(request: Request) {
  try { return await request.json(); } catch { throw new ArchiveValidationError('בקשת JSON אינה תקינה'); }
}
export function archiveApiError(error: unknown) {
  if (error instanceof ArchiveValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error('Fan archive operation failed');
  return NextResponse.json({ error: 'לא ניתן להשלים את הפעולה כרגע' }, { status: 500 });
}
export const archivePrivateHeaders = { 'Cache-Control': 'private, no-store' };

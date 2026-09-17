import { weeklyQuiz } from '@/lib/fan-discovery-data';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 2048) return Response.json({ error: 'Invalid answer' }, { status: 400 });
  let body: { id?: unknown; choice?: unknown };
  try { const text = await request.text(); if (text.length > 2048) throw new Error(); body = JSON.parse(text); }
  catch { return Response.json({ error: 'Invalid answer' }, { status: 400 }); }
  if (!body || typeof body.id !== 'string' || !['ניצחון', 'תיקו', 'הפסד'].includes(String(body.choice))) return Response.json({ error: 'Invalid answer' }, { status: 400 });
  try {
    const fact = await weeklyQuiz();
    if (!fact || fact.id !== body.id) return Response.json({ error: 'Question changed' }, { status: 409 });
    return Response.json({ correct: fact.result === body.choice, fact }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Temporarily unavailable' }, { status: 503 }); }
}

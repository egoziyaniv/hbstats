import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { youtubeId } from '@/lib/youtube';
import { fetchVideoMeta } from '@/lib/videos/youtube-fetch';
import { matchVideo } from '@/lib/videos/match';
import { loadHbsGames, labelGames } from '@/lib/videos/service';

export const dynamic = 'force-dynamic';

// Admin pastes a YouTube link → video details + the games it most likely shows.
export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = youtubeId(body?.url) ?? (/^[A-Za-z0-9_-]{11}$/.test(body?.url ?? '') ? body.url : null);
  if (!id) return NextResponse.json({ error: 'זה לא נראה כמו קישור ליוטיוב' }, { status: 400 });
  const meta = await fetchVideoMeta(id).catch(() => null);
  if (!meta) return NextResponse.json({ error: 'לא הצלחתי לקרוא את הסרטון מיוטיוב' }, { status: 502 });
  const result = matchVideo(meta, await loadHbsGames());
  const labels = await labelGames(result.candidates.map((c) => c.gameId));
  return NextResponse.json({
    video: { ...meta, publishedAt: meta.publishedAt?.toISOString() ?? null },
    kind: result.kind,
    confidence: result.confidence,
    why: result.why,
    candidates: result.candidates.map((c) => ({ ...c, game: labels.get(c.gameId) ?? null })),
  });
}

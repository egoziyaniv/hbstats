// Store matched YouTube videos and link them to games (GameEditorial.recapVideoUrl / fullMatchUrl).
import prisma from '@/lib/prisma';
import { HAPOEL_BEER_SHEVA_API_ID } from '@/lib/home-club-hub';
import { matchVideo, type HbsGame, type MatchResult, type VideoKind } from './match';
import type { YtVideoMeta } from './youtube-fetch';

const hbsTeam = {
  OR: [
    { apiFootballId: HAPOEL_BEER_SHEVA_API_ID },
    { nameHe: { startsWith: 'הפועל', contains: 'באר שבע' } },
    { nameHe: { startsWith: 'הפועל', contains: 'באר-שבע' } },
  ],
};
export const hbsGameWhere = { OR: [{ homeTeam: hbsTeam }, { awayTeam: hbsTeam }] };

const isHbs = (t: { apiFootballId: number | null; nameHe: string }) =>
  t.apiFootballId === HAPOEL_BEER_SHEVA_API_ID || (/^הפועל/.test(t.nameHe) && /באר[ -]שבע/.test(t.nameHe));

function roundNumber(s: string | null): number | null {
  const m = s?.match(/^(?:מחזור|Round|Regular Season -)\s*(\d{1,2})$/);
  return m ? Number(m[1]) : null;
}

/** Every finished Beer Sheva game with a score, in the matcher's shape. */
export async function loadHbsGames(): Promise<HbsGame[]> {
  const rows = await prisma.game.findMany({
    where: { ...hbsGameWhere, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null } },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true, roundNameHe: true, roundNameEn: true,
      homeTeam: { select: { nameHe: true, nameEn: true, apiFootballId: true } },
      awayTeam: { select: { nameHe: true, nameEn: true, apiFootballId: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    dateTime: r.dateTime,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    homeName: r.homeTeam.nameHe || r.homeTeam.nameEn,
    awayName: r.awayTeam.nameHe || r.awayTeam.nameEn,
    hbsHome: isHbs(r.homeTeam),
    round: roundNumber(r.roundNameHe) ?? roundNumber(r.roundNameEn),
  }));
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
const field = (kind: VideoKind) => (kind === 'full' ? 'fullMatchUrl' : 'recapVideoUrl');

/** Put the video on the game page (replaces whatever was in that slot). */
export async function attachVideo(gameId: string, videoId: string, kind: VideoKind): Promise<void> {
  const data = { [field(kind)]: watchUrl(videoId) };
  await prisma.gameEditorial.upsert({ where: { gameId }, create: { gameId, ...data }, update: data });
}

/** Take the video off its game page if it is the one shown there. */
export async function detachVideo(gameId: string, videoId: string): Promise<void> {
  const ed = await prisma.gameEditorial.findUnique({ where: { gameId } });
  if (!ed) return;
  const data: Record<string, null> = {};
  if (ed.recapVideoUrl?.includes(videoId)) data.recapVideoUrl = null;
  if (ed.fullMatchUrl?.includes(videoId)) data.fullMatchUrl = null;
  if (Object.keys(data).length) await prisma.gameEditorial.update({ where: { gameId }, data });
}

async function slotFree(gameId: string, kind: VideoKind): Promise<boolean> {
  const ed = await prisma.gameEditorial.findUnique({ where: { gameId }, select: { recapVideoUrl: true, fullMatchUrl: true } });
  return !ed?.[field(kind)];
}

/**
 * Match one video and record it. A confident match whose slot on the game page is empty is
 * linked right away (status AUTO); anything else waits for the admin (PENDING). Videos the
 * admin already decided on are left alone.
 */
export async function recordVideo(meta: YtVideoMeta, games: HbsGame[], source: 'scan' | 'admin' = 'scan'): Promise<{ result: MatchResult; status: string | null }> {
  const result = matchVideo(meta, games);
  const existing = await prisma.gameVideoCandidate.findUnique({ where: { videoId: meta.videoId } });
  if (existing && (existing.status === 'APPROVED' || existing.status === 'REJECTED' || existing.status === 'AUTO')) {
    return { result, status: existing.status };
  }
  const best = result.candidates[0] ?? null;
  let status = 'PENDING';
  if (source === 'scan' && best && result.confidence === 'high' && (await slotFree(best.gameId, result.kind))) {
    await attachVideo(best.gameId, meta.videoId, result.kind);
    status = 'AUTO';
  }
  // Not placeable (or not a match video): remembered so the scan doesn't refetch it, kept out of the queue.
  if (source === 'scan' && !best) status = 'REJECTED';
  const data = {
    title: meta.title, channel: meta.channel, publishedAt: meta.publishedAt, durationSec: meta.durationSec,
    kind: result.kind, gameId: best?.gameId ?? null, confidence: result.confidence, status, reason: result.why, source,
  };
  await prisma.gameVideoCandidate.upsert({ where: { videoId: meta.videoId }, create: { videoId: meta.videoId, ...data }, update: data });
  return { result, status };
}

export interface GameLabel {
  id: string;
  date: string;
  homeName: string;
  awayName: string;
  score: string;
  competition: string | null;
}

/** Display labels for game ids (admin lists). */
export async function labelGames(ids: string[]): Promise<Map<string, GameLabel>> {
  const rows = await prisma.game.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true,
      homeTeam: { select: { nameHe: true, nameEn: true } }, awayTeam: { select: { nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true, nameEn: true } },
    },
  });
  return new Map(rows.map((r) => [r.id, {
    id: r.id,
    date: r.dateTime.toISOString(),
    homeName: r.homeTeam.nameHe || r.homeTeam.nameEn,
    awayName: r.awayTeam.nameHe || r.awayTeam.nameEn,
    score: r.homeScore != null && r.awayScore != null ? `${r.homeScore}-${r.awayScore}` : '',
    competition: r.competition ? r.competition.nameHe || r.competition.nameEn : null,
  }]));
}

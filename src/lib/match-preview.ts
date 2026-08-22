import prisma from '@/lib/prisma';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI } from '@/lib/ai-providers';

export interface FormItem {
  gameId: string;
  result: 'W' | 'D' | 'L';
  scoreHe: string; // "2 - 1" from this team's perspective
  opponentHe: string;
  dateISO: string;
}

export interface SidelinedItem {
  nameHe: string;
  typeHe: string;
  kind: 'injury' | 'suspension';
}

export interface MatchPreview {
  form: { home: FormItem[]; away: FormItem[] };
  sidelined: { home: SidelinedItem[]; away: SidelinedItem[] };
  aiSummary: string | null;
}

const SUSPENSION_RE = /suspend|card|הרחק|כרטיס/i;

/** Last N completed games of a team before `before`, with W/D/L from its view. */
async function recentForm(teamId: string, before: Date, take = 5): Promise<FormItem[]> {
  const games = await prisma.game.findMany({
    where: {
      status: 'COMPLETED',
      dateTime: { lt: before },
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { dateTime: 'desc' },
    take,
    select: {
      id: true, dateTime: true, homeTeamId: true, homeScore: true, awayScore: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
  });
  return games.map((g) => {
    const home = g.homeTeamId === teamId;
    const gf = (home ? g.homeScore : g.awayScore) ?? 0;
    const ga = (home ? g.awayScore : g.homeScore) ?? 0;
    const opp = home ? g.awayTeam : g.homeTeam;
    return {
      gameId: g.id,
      result: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
      scoreHe: `${gf} - ${ga}`,
      opponentHe: opp.nameHe || opp.nameEn || '—',
      dateISO: g.dateTime.toISOString(),
    } as FormItem;
  });
}

/** Active injuries + suspensions for a team's players in the game's season. */
async function sidelinedFor(teamId: string, seasonId: string, now: Date): Promise<SidelinedItem[]> {
  const rows = await prisma.playerSidelinedEntry.findMany({
    where: {
      seasonId,
      player: { teamId },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: { playerNameHe: true, typeHe: true, typeEn: true, player: { select: { nameHe: true } } },
    orderBy: { startDate: 'desc' },
  });
  const seen = new Set<string>();
  const out: SidelinedItem[] = [];
  for (const r of rows) {
    const nameHe = r.player?.nameHe || r.playerNameHe || 'לא ידוע';
    if (seen.has(nameHe)) continue;
    seen.add(nameHe);
    out.push({
      nameHe,
      typeHe: r.typeHe || r.typeEn || '—',
      kind: SUSPENSION_RE.test(`${r.typeEn} ${r.typeHe}`) ? 'suspension' : 'injury',
    });
  }
  return out;
}

// In-memory AI-summary cache keyed by gameId + a hash of the facts, so it
// regenerates when form/sidelined change but not on every page view.
const summaryMemo = new Map<string, string | null>();

async function aiSummary(
  game: { id: string; homeName: string; awayName: string; competitionHe: string | null; dateISO: string },
  form: MatchPreview['form'],
  sidelined: MatchPreview['sidelined'],
  h2hLine: string | null,
): Promise<string | null> {
  const facts = JSON.stringify({
    match: `${game.homeName} מארחת את ${game.awayName}`,
    competition: game.competitionHe,
    formHome: form.home.map((f) => f.result).join(''),
    formAway: form.away.map((f) => f.result).join(''),
    h2h: h2hLine,
    outHome: sidelined.home.map((s) => `${s.nameHe} (${s.typeHe})`),
    outAway: sidelined.away.map((s) => `${s.nameHe} (${s.typeHe})`),
  });
  const memoKey = `${game.id}|${facts.length}|${facts}`;
  if (summaryMemo.has(memoKey)) return summaryMemo.get(memoKey)!;
  try {
    const settings = await getAiSettings();
    const apiKey = await getActiveApiKey(settings);
    if (!apiKey) { summaryMemo.set(memoKey, null); return null; }
    const prompt =
      `אתה כתב כדורגל ישראלי. כתוב פסקת תצוגה קצרה (2-3 משפטים, עברית) לקראת המשחק, ` +
      `על בסיס העובדות בלבד — בלי להמציא מספרים. אזכר כושר אחרון, מפגשים קודמים אם יש, ` +
      `ושחקנים חסרים אם יש. עובדות: ${facts}`;
    const messages = [{ role: 'user' as const, content: prompt }];
    const text = (settings.provider === 'openai'
      ? await chatWithOpenAI(apiKey, messages, 'gpt-5.6-luna')
      : await chatWithClaude(apiKey, messages)).trim();
    const result = text || null;
    summaryMemo.set(memoKey, result);
    return result;
  } catch {
    return null;
  }
}

/** Build the pre-match preview for a scheduled game. */
export async function buildMatchPreview(game: {
  id: string; seasonId: string | null; dateTime: Date;
  homeTeamId: string; awayTeamId: string;
  homeTeam: { nameHe: string | null; nameEn: string | null };
  awayTeam: { nameHe: string | null; nameEn: string | null };
  competition: { nameHe: string | null; nameEn: string | null } | null;
}, h2hLine: string | null = null): Promise<MatchPreview> {
  const now = new Date();
  const [homeForm, awayForm, homeOut, awayOut] = await Promise.all([
    recentForm(game.homeTeamId, game.dateTime, 5),
    recentForm(game.awayTeamId, game.dateTime, 5),
    game.seasonId ? sidelinedFor(game.homeTeamId, game.seasonId, now) : Promise.resolve([]),
    game.seasonId ? sidelinedFor(game.awayTeamId, game.seasonId, now) : Promise.resolve([]),
  ]);
  const form = { home: homeForm, away: awayForm };
  const sidelined = { home: homeOut, away: awayOut };
  const summary = await aiSummary(
    {
      id: game.id,
      homeName: game.homeTeam.nameHe || game.homeTeam.nameEn || '',
      awayName: game.awayTeam.nameHe || game.awayTeam.nameEn || '',
      competitionHe: game.competition?.nameHe || game.competition?.nameEn || null,
      dateISO: game.dateTime.toISOString(),
    },
    form,
    sidelined,
    h2hLine,
  );
  return { form, sidelined, aiSummary: summary };
}

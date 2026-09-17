type Team = { apiFootballId: number | null; nameHe: string; nameEn: string };
export type EvidenceGame = {
  id: string; dateTime: Date; status: string; statusShort: string | null; statusLong: string | null;
  homeScore: number | null; awayScore: number | null; homeTeam: Team; awayTeam: Team;
  season: { name: string }; competition: { nameHe: string; nameEn: string } | null;
};
export function isConfirmedFixture(game: { statusShort: string | null; statusLong: string | null }): boolean {
  return /^(NS|1H|HT|2H|ET|BT|P|LIVE)$/.test(game.statusShort ?? '') && !/postponed|suspended|undefined|to be defined|נדחה/i.test(game.statusLong ?? '');
}
export function evidence(game: EvidenceGame) {
  if (game.status !== 'COMPLETED' || !Number.isInteger(game.homeScore) || !Number.isInteger(game.awayScore) || game.homeScore! < 0 || game.awayScore! < 0) return null;
  const home = game.homeTeam.apiFootballId === 563;
  if (!home && game.awayTeam.apiFootballId !== 563) return null;
  const goalsFor = (home ? game.homeScore : game.awayScore)!;
  const goalsAgainst = (home ? game.awayScore : game.homeScore)!;
  const other = home ? game.awayTeam : game.homeTeam;
  return { id: game.id, opponent: other.nameHe || other.nameEn, goalsFor, goalsAgainst,
    result: goalsFor > goalsAgainst ? 'ניצחון' : goalsFor < goalsAgainst ? 'הפסד' : 'תיקו',
    home: home, season: game.season.name, date: game.dateTime.toISOString(), competition: game.competition?.nameHe || game.competition?.nameEn || 'מסגרת לא ידועה',
    source: `https://statsai.co.il/games/${encodeURIComponent(game.id)}` };
}
export type MatchFact = NonNullable<ReturnType<typeof evidence>>;
/** Monday-based UTC week; stable for an unchanged set of historical records. */
export function weeklyPick<T extends { id: string }>(games: T[], now: Date): T | null {
  if (!games.length) return null;
  const week = Math.floor((now.getTime() - Date.UTC(1970, 0, 5)) / 604800000);
  return [...games].sort((a, b) => a.id.localeCompare(b.id, 'en'))[((week % games.length) + games.length) % games.length];
}
function xml(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!)); }
export function factSvg(fact: MatchFact): string {
  const date = new Date(fact.date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const lines = ['StatsAI · הפועל באר שבע', `${fact.result} מול ${fact.opponent}`, `${fact.goalsFor} שערי זכות · ${fact.goalsAgainst} שערי חובה`, `${fact.season} · ${fact.competition} · ${date}`, 'משחק אחד · ללא הכרעת פנדלים · נתוני האתר', fact.source];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#7f1d1d"/>${lines.map((line, i) => `<text x="600" y="${100 + i * 80}" text-anchor="middle" direction="${i === 5 ? 'ltr' : 'rtl'}" fill="white" font-family="Arial,sans-serif" font-size="${i === 5 ? 23 : 36}">${xml(line)}</text>`).join('')}</svg>`;
}

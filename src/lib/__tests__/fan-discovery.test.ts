import { evidence, weeklyPick, factSvg, isConfirmedFixture } from '@/lib/fan-discovery';
const game = { id: 'g', dateTime: new Date('2025-01-01T18:00:00Z'), status: 'COMPLETED', statusShort: 'FT', statusLong: null, homeScore: 1, awayScore: 3, homeTeam: { apiFootballId: 1, nameHe: 'יריבה', nameEn: '' }, awayTeam: { apiFootballId: 563, nameHe: 'באר שבע', nameEn: '' }, season: { name: '2024/25' }, competition: { nameHe: 'ליגה', nameEn: '' } };
it('derives the club result from the actual away side', () => {
 expect(evidence(game)).toMatchObject({ goalsFor: 3, goalsAgainst: 1, result: 'ניצחון', opponent: 'יריבה' });
});
it('refuses missing scores, foreign games and unfinished evidence', () => {
 expect(evidence({ ...game, awayScore: null })).toBeNull();
 expect(evidence({ ...game, status: 'SCHEDULED' })).toBeNull();
 expect(evidence({ ...game, awayTeam: game.homeTeam })).toBeNull();
});
it('selects consistently within a Monday UTC week regardless input order', () => {
 const rows = [game, { ...game, id: 'b' }, { ...game, id: 'a' }];
 expect(weeklyPick(rows, new Date('2026-09-14T00:00:00Z'))?.id).toBe(weeklyPick(rows.reverse(), new Date('2026-09-20T23:59:59Z'))?.id);
 expect(weeklyPick([], new Date())).toBeNull();
});
it('rejects postponed and undefined kickoff metadata', () => {
 expect(isConfirmedFixture({ statusShort: 'PST', statusLong: null })).toBe(false);
 expect(isConfirmedFixture({ statusShort: null, statusLong: 'Time To Be Defined' })).toBe(false);
 expect(isConfirmedFixture({ statusShort: null, statusLong: null })).toBe(false);
 expect(isConfirmedFixture({ statusShort: 'NS', statusLong: null })).toBe(true);
});
it('escapes all card text and identifies scope and source', () => {
 const fact = evidence({ ...game, homeTeam: { ...game.homeTeam, nameHe: '<script>&"' } })!;
 const svg = factSvg(fact);
 expect(svg).not.toContain('<script>');
 expect(svg).toContain('&lt;script&gt;');
 expect(svg).toContain('2024/25');
 expect(svg).toContain('https://statsai.co.il/games/g');
});

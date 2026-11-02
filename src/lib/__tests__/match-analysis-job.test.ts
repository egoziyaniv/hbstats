import { g } from './match-analysis-fixtures';

const rows = new Map<string, Record<string, unknown>>();
const key = (w: { gameId_kind: { gameId: string; kind: string } }) => `${w.gameId_kind.gameId}|${w.gameId_kind.kind}`;

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    matchAnalysis: {
      findUnique: jest.fn(async ({ where }) => (rows.has(key(where)) ? { id: key(where) } : null)),
      upsert: jest.fn(async ({ where, create, update }) => {
        const k = key(where);
        rows.set(k, { ...(rows.get(k) ?? create), ...(rows.has(k) ? update : {}) });
        return rows.get(k);
      }),
    },
    user: { findMany: jest.fn(async () => [{ pushTokens: [{ token: 'ExpoPushToken[x]' }] }]) },
  },
}));
const sendIfAny = jest.fn(async () => ({ sent: 1, failed: 0, invalidTokens: [] }));
jest.mock('@/lib/push-notify', () => ({ sendIfAny: (...a: unknown[]) => sendIfAny(...(a as [])) }));
jest.mock('@/lib/match-analysis/write', () => ({
  writeAnalysis: jest.fn(async (kind: string) => ({ titleHe: `כותרת ${kind}`, bodyHe: '1. סעיף' })),
}));
jest.mock('@/lib/match-analysis/history', () => ({ loadAnalysisContext: jest.fn() }));

import { buildAnalyses } from '@/lib/match-analysis/job';

describe('buildAnalyses', () => {
  const prev = g({ gf: 5, ga: 2, atHome: false });
  const target = g({ gf: 5, ga: 2, atHome: false });
  const next = g({ gf: null, ga: null, opponentHe: 'OFI' });
  const ctx = { clubHe: 'הפועל באר שבע', teamIds: [], games: [prev, target, next], leagueFrom: null, league: [] };

  beforeEach(() => { rows.clear(); sendIfAny.mockClear(); });

  it('drafts the game and the next one, then leaves them alone', async () => {
    const first = await buildAnalyses(target.id, { ctx });
    expect(first.map((p) => [p.kind, p.gameId, p.status])).toEqual([['POST', target.id, 'created'], ['PRE', next.id, 'created']]);
    const post = rows.get(`${target.id}|POST`)!;
    expect(post).toMatchObject({ status: 'DRAFT', scoreAtBuild: '2-5', sourceGameId: target.id, titleHe: 'כותרת POST' });
    expect((post.facts as Array<{ key: string }>).map((f) => f.key)).toContain('same-score-streak');
    expect(sendIfAny).toHaveBeenCalledTimes(1);

    const again = await buildAnalyses(target.id, { ctx });
    expect(again.map((p) => p.status)).toEqual(['kept', 'kept']);
    expect(sendIfAny).toHaveBeenCalledTimes(1);
  });

  it('rebuilds on force without notifying, and writes nothing on dry', async () => {
    await buildAnalyses(target.id, { ctx });
    const forced = await buildAnalyses(target.id, { ctx, force: true });
    expect(forced.map((p) => p.status)).toEqual(['rebuilt', 'rebuilt']);
    expect(sendIfAny).toHaveBeenCalledTimes(1);
    rows.clear();
    const dry = await buildAnalyses(target.id, { ctx, dry: true });
    expect(dry).toHaveLength(2);
    expect(rows.size).toBe(0);
  });

  it('refuses a game that has not been played', async () => {
    await expect(buildAnalyses(next.id, { ctx })).rejects.toThrow();
  });
});

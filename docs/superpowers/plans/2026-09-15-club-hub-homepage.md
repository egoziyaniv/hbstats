# Club Hub Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public homepage as a responsive, Hapoel Be'er Sheva-first club hub whose match, season, news, and chart content all follow the selected team.

**Architecture:** Keep `src/app/page.tsx` as the server-side data composition boundary, but move team-context calculation and match-derived facts into a pure library. Introduce focused presentational components for the match hero, season overview, trend chart, and club archive card; reuse the existing home filter, standings calculation, Telegram feed, evidence routes, and detailed pages.

**Tech Stack:** Next.js App Router, TypeScript, React Server Components, Tailwind CSS, Prisma, Recharts, Jest.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/home-club-hub.ts` | Resolve one homepage club context and calculate form, home rate, season totals, and trend values from completed games. |
| `src/lib/__tests__/home-club-hub.test.ts` | Unit coverage for fallback selection, score orientation, incomplete games, and trend data. |
| `src/components/HomeClubHubHero.tsx` | Responsive matchday hero for live, scheduled, completed, and no-fixture states. |
| `src/components/HomeClubSeasonSnapshot.tsx` | Position, points, goals, home record, form, and evidence/deep links. |
| `src/components/HomeClubTrendChart.tsx` | Compact accessible Recharts trend card with an explicit insufficient-data state. |
| `src/components/HomeClubArchiveCard.tsx` | Existing-data archive entry point; it never invents historical claims. |
| `src/components/HomeFilterBar.tsx` | Change the homepage selector to a single club context while preserving URL state. |
| `src/app/page.tsx` | Compose existing queries with the new pure view model; replace the current top-of-page card ordering. |
| `src/app/globals.css` | Add only component-scoped responsive hero/chart styling where Tailwind classes cannot express the existing visual treatment. |
| `src/lib/version.ts`, `package.json` | Increase patch version before the feature push, as required by `AGENTS.md`. |

### Task 1: Establish a single, testable club context

**Files:**
- Create: `src/lib/home-club-hub.ts`
- Create: `src/lib/__tests__/home-club-hub.test.ts`

- [ ] **Step 1: Write the failing selection tests**

```ts
import { resolveHomeClubId } from '@/lib/home-club-hub';

const teams = [
  { id: 'hbs', apiFootballId: 563 },
  { id: 'other', apiFootballId: 999 },
];

it('uses one explicit team before the saved favourite and Hapoel Be’er Sheva fallback', () => {
  expect(resolveHomeClubId(['other'], ['hbs'], teams)).toBe('other');
  expect(resolveHomeClubId([], ['other'], teams)).toBe('other');
  expect(resolveHomeClubId([], [], teams)).toBe('hbs');
});

it('returns null when the fallback club is absent from this season', () => {
  expect(resolveHomeClubId([], [], [{ id: 'other', apiFootballId: 999 }])).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --runInBand src/lib/__tests__/home-club-hub.test.ts`
Expected: FAIL because `@/lib/home-club-hub` does not exist.

- [ ] **Step 3: Implement the resolver and completed-match calculators**

```ts
export const HAPOEL_BEER_SHEVA_API_ID = 563;

export function resolveHomeClubId(
  queryTeamIds: string[],
  favouriteTeamIds: string[],
  teams: Array<{ id: string; apiFootballId: number | null }>,
) {
  const available = new Set(teams.map((team) => team.id));
  return queryTeamIds.find((id) => available.has(id))
    ?? favouriteTeamIds.find((id) => available.has(id))
    ?? teams.find((team) => team.apiFootballId === HAPOEL_BEER_SHEVA_API_ID)?.id
    ?? null;
}
```

Add typed helpers `resolveClubScore`, `buildClubForm`, and `buildClubSeasonSnapshot`. They must include only `COMPLETED` matches with integer canonical scores, orient away scores correctly, and return `null` for unavailable rates instead of `0`.

- [ ] **Step 4: Add score and trend edge cases**

```ts
it('does not treat scheduled or scoreless games as losses', () => {
  expect(buildClubForm('hbs', [
    game({ status: 'SCHEDULED', homeScore: null, awayScore: null }),
    game({ homeTeamId: 'away', awayTeamId: 'hbs', homeScore: 0, awayScore: 2 }),
  ])).toEqual(['W']);
});

it('returns no trend before three completed club matches exist', () => {
  expect(buildClubTrend('hbs', [game(), game({ id: 'two' })])).toEqual([]);
});
```

- [ ] **Step 5: Run the focused test suite**

Run: `npm test -- --runInBand src/lib/__tests__/home-club-hub.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/home-club-hub.ts src/lib/__tests__/home-club-hub.test.ts
git commit -m "feat: add homepage club context"
```

### Task 2: Make the team selector produce one coherent hub

**Files:**
- Modify: `src/components/HomeFilterBar.tsx`
- Test: `src/lib/__tests__/home-club-hub.test.ts`

- [ ] **Step 1: Extend the resolver test for multiple legacy query values**

```ts
it('uses the first valid team when old multi-value links are opened', () => {
  expect(resolveHomeClubId(['missing', 'other', 'hbs'], [], teams)).toBe('other');
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --runInBand src/lib/__tests__/home-club-hub.test.ts`
Expected: PASS after Task 1; this case fails until the resolver is adjusted if necessary.

- [ ] **Step 3: Replace multi-select interaction with a single club picker**

Change `HomeFilterBar` props to `selectedTeamId: string | null`. Render the active club label and one accessible button per available club. On selection, write exactly one `team` parameter:

```ts
function choose(teamId: string) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete('team');
  params.set('team', teamId);
  router.push(`/?${params.toString()}`);
  setOpen(false);
}
```

Add a “ברירת מחדל: הפועל באר שבע” reset action that removes the parameter. Keep the component client-only and preserve RTL labels.

- [ ] **Step 4: Verify interaction locally**

Run: `npm run dev -- --port 8011`
Open: `http://localhost:8011/`
Expected: selecting a club replaces the query with one `team` value; reset returns to the Hapoel Be'er Sheva fallback.

- [ ] **Step 5: Commit**

```bash
git add src/components/HomeFilterBar.tsx src/lib/__tests__/home-club-hub.test.ts
git commit -m "feat: make homepage team selection singular"
```

### Task 3: Build the matchday hero and season summary components

**Files:**
- Create: `src/components/HomeClubHubHero.tsx`
- Create: `src/components/HomeClubSeasonSnapshot.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Define presentational component props before wiring data**

```ts
export type HomeClubFixture = {
  id: string;
  state: 'LIVE' | 'UPCOMING' | 'COMPLETED' | 'EMPTY';
  competitionName: string;
  dateLabel: string | null;
  venueName: string | null;
  home: { id: string; label: string };
  away: { id: string; label: string };
  homeScore: number | null;
  awayScore: number | null;
};
```

Render a semantic `section` with a single heading, game link when `id` exists, score only for live/completed states, and a text-only empty state when there is no fixture.

- [ ] **Step 2: Wire a deterministic priority in `page.tsx`**

Build the hub fixture in this order: selected-club live game, selected-club upcoming game, selected-club latest completed game, empty. Do not use the rotating all-league `HeroMatchCarousel` for the selected club hero. Preserve `HeroMatchCarousel` as a fallback only when no club can be resolved.

- [ ] **Step 3: Wire season snapshot data from existing standings and completed games**

Pass the selected club’s row from `sortedStandings` and the output of `buildClubSeasonSnapshot`. Use the existing season dossier URL:

```ts
const dossierHref = selectedTeam
  ? `/club/seasons/${featuredSeason.id}?teamId=${selectedTeam.id}`
  : '/club/seasons';
```

Link match-derived cards to the existing evidence destination only when an evidence-backed metric is available; otherwise render an “עדיין אין בסיס נתונים” label.

- [ ] **Step 4: Run static validation**

Run: `npm run lint && npm run build`
Expected: PASS with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/HomeClubHubHero.tsx src/components/HomeClubSeasonSnapshot.tsx src/app/page.tsx
git commit -m "feat: add homepage matchday club hub"
```

### Task 4: Add visual trend and archive content without invented facts

**Files:**
- Create: `src/components/HomeClubTrendChart.tsx`
- Create: `src/components/HomeClubArchiveCard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add trend data tests**

```ts
it('uses cumulative points per completed match and preserves chronological order', () => {
  expect(buildClubTrend('hbs', [
    game({ id: 'first', homeScore: 0, awayScore: 1 }),
    game({ id: 'second', homeScore: 2, awayScore: 0 }),
    game({ id: 'third', homeScore: 1, awayScore: 1 }),
  ])).toEqual([
    { match: 1, points: 0 },
    { match: 2, points: 3 },
    { match: 3, points: 4 },
  ]);
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --runInBand src/lib/__tests__/home-club-hub.test.ts`
Expected: PASS after `buildClubTrend` is implemented.

- [ ] **Step 3: Implement the accessible trend card**

Use Recharts `LineChart` and `ResponsiveContainer`, mirroring the safe chart pattern in `src/components/Charts.tsx`. Provide `aria-label` and a textual summary such as “X נקודות אחרי Y משחקים”. When fewer than three complete games exist, omit the chart and show a compact, non-zero empty state.

- [ ] **Step 4: Implement archive card from real records**

Query one completed selected-club game from a prior season, ordered by date descending, only when a concrete historical label can be generated. Link to `/games/[id]`; use no hard-coded scoreline, date, or claim. If no prior game exists, omit the card.

- [ ] **Step 5: Add responsive styles**

In `globals.css`, add only scoped selectors for the dark red hero surface, card focus, and mobile stack. Ensure no global color token changes and use Tailwind breakpoints for component layout.

- [ ] **Step 6: Run tests and visual verification**

Run: `npm test -- --runInBand src/lib/__tests__/home-club-hub.test.ts && npm run build`
Open desktop and a 390px-wide viewport.
Expected: hero → snapshot → match cards → trend → news ordering on mobile; no horizontal overflow.

- [ ] **Step 7: Commit**

```bash
git add src/components/HomeClubTrendChart.tsx src/components/HomeClubArchiveCard.tsx src/app/page.tsx src/app/globals.css src/lib/home-club-hub.ts src/lib/__tests__/home-club-hub.test.ts
git commit -m "feat: add homepage trend and archive cards"
```

### Task 5: Reorder existing news, standings, and detailed destinations around the hub

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ClubHubBand.tsx`

- [ ] **Step 1: Put core club context before secondary league content**

Render the order as:

```tsx
<HomeClubHubHero fixture={clubFixture} />
<HomeFilterBar teams={seasonTeams} selectedTeamId={selectedTeamId} />
<HomeClubSeasonSnapshot ... />
<HomeClubTrendChart ... />
<LatestMatchCard ... />
<CompactStandings rows={compactStandings} selectedTeamId={selectedTeamId} />
<NewsFeed messages={telegramMessages} />
<HomeClubArchiveCard archive={archiveGame} />
```

Keep `HomeLivePanel`, on-this-day, predictions, leaderboards, head-to-head, and goal-minute content below this core sequence.

- [ ] **Step 2: Scope news safely**

Reuse `fetchTelegramMessagesFromSources` and the existing image fallback. Do not add remote image domains or bypass `MediaImage` safety logic. If a team label is available on a message/source, prefer selected-club messages; otherwise retain the configured general feed and label it by source.

- [ ] **Step 3: Make club links context-preserving**

Append `season` and `teamId` where existing destination routes support them. Do not introduce new query contracts for routes that do not read them.

- [ ] **Step 4: Run build and manually test four states**

Run: `npm run build`
Verify: Hapoel Be'er Sheva default, explicit other team, no selected team available in the featured season, and a season with fewer than three completed matches.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/ClubHubBand.tsx
git commit -m "feat: prioritize club context on homepage"
```

### Task 6: Version, full verification, and release preparation

**Files:**
- Modify: `package.json`
- Modify: `src/lib/version.ts`
- Modify: `docs/superpowers/specs/2026-09-15-club-hub-homepage-design.md` only if behavior changed during implementation

- [ ] **Step 1: Increase both version declarations to the same next patch version**

```ts
// src/lib/version.ts
export const APP_VERSION = '0.39.3';
```

```json
{ "version": "0.39.3" }
```

- [ ] **Step 2: Run the relevant unit suites**

Run:
```bash
npm test -- --runInBand src/lib/__tests__/home-club-hub.test.ts src/lib/__tests__/season-dossier-metrics.test.ts src/lib/__tests__/home-league-scope.test.ts
```
Expected: PASS.

- [ ] **Step 3: Run final project validation**

Run:
```bash
npm run lint
npm run build
git diff --check
git status --short
```
Expected: lint and build pass, no whitespace errors, and only intended version/source changes are present.

- [ ] **Step 4: Commit release-ready changes**

```bash
git add package.json src/lib/version.ts src/app/page.tsx src/components src/lib docs/superpowers/specs
git commit -m "feat: launch club hub homepage"
```

- [ ] **Step 5: Deploy only after the reviewed commit is pushed**

Follow `AGENTS.md`: push the branch, then on the Hetzner server run `git pull`, `npm install`, `npm run build`, and `pm2 restart hbstats`. No Prisma command is needed unless implementation changes `prisma/schema.prisma`.

## Self-review

**Spec coverage:** Tasks 1–3 implement default club selection, consistent selected-team data, the fixture priority, season snapshot, evidence links, and responsive hero. Task 4 covers trend, archive, empty states, and accessibility. Task 5 covers news, table, page ordering, and context-preserving links. Task 6 enforces versioning, tests, build, and release verification.

**Placeholder scan:** The plan contains no unfinished placeholders. Exact commands, prop contracts, test expectations, and URL behavior are specified for every implementation task.

**Type consistency:** `selectedTeamId` is a single string or null through selector, resolver, page, standings highlight, snapshot, and fixture selection. Match-derived calculations consume completed canonical scores only, matching the existing season-dossier metric behavior.

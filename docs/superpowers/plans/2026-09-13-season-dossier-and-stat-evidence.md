# Season Dossier and Stat Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build public and admin season dossiers for Hapoel Beer Sheva's 2026/27 and 2025/26 seasons, with shared Web/Mobile data and evidence explaining every headline metric.

**Architecture:** Add normalized editorial, moment, and source models while keeping all statistics derived from existing canonical game and standing rows. A single `season-dossier` service returns the shared DTO used by the Web page and Mobile API; clients only render it. Public routes are pilot-gated by season year and team identity, while admin mutations validate every linked entity.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/PostgreSQL, React Server Components, Expo Router/React Native, TanStack Query, Jest.

---

## File map

- `prisma/schema.prisma`: dossier, moment, source models and enums; relations only.
- `shared/types/mobile-api.ts`: canonical public DTO shared by Web and Mobile.
- `src/lib/season-dossier-metrics.ts`: pure match filtering, result and evidence calculations.
- `src/lib/season-dossier.ts`: Prisma data assembly, pilot gating and published/admin views.
- `src/lib/season-dossier-validation.ts`: admin payload and URL/entity validation.
- `src/app/club/seasons/[seasonId]/page.tsx`: public Server Component.
- `src/components/SeasonDossierClient.tsx`: metric evidence disclosure and sticky section navigation.
- `src/app/api/mobile/v1/club/seasons/[seasonId]/route.ts`: public Mobile API.
- `src/app/admin/club/seasons/[seasonId]/page.tsx`: protected editor page.
- `src/components/admin/SeasonDossierAdminClient.tsx`: draft, moments and sources editor.
- `src/app/api/admin/club/seasons/[seasonId]/route.ts`: dossier GET/PUT.
- `src/app/api/admin/club/seasons/[seasonId]/moments/route.ts`: moment POST.
- `src/app/api/admin/club/seasons/[seasonId]/moments/[id]/route.ts`: moment PUT/DELETE.
- `src/app/api/admin/club/seasons/[seasonId]/sources/route.ts`: source POST.
- `src/app/api/admin/club/seasons/[seasonId]/sources/[id]/route.ts`: source PUT/DELETE.
- `mobile/hooks/useSeasonDossier.ts`: query wrapper.
- `mobile/app/club/seasons/[seasonId].tsx`: native season dossier screen and evidence modal.
- existing archive/admin navigation files: entry points.

### Task 1: Schema and shared contract

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `shared/types/mobile-api.ts`
- Test: `src/lib/__tests__/season-dossier-schema.test.ts`

- [ ] **Step 1: Write a schema contract test**

Read `prisma/schema.prisma` and assert the three models, unique dossier key, source scope/status enums, safe cascade direction and required indexes are present. Import the public DTO in a compile-time fixture containing `season`, `team`, four metrics, editorial, moments, squad, standing, honors, competitions and games.

- [ ] **Step 2: Run the test and typecheck to verify failure**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier-schema.test.ts && npx tsc --noEmit --incremental false`  
Expected: FAIL because the models and DTO do not exist.

- [ ] **Step 3: Add Prisma models and enums**

Add `ClubSeasonDossier`, `ClubSeasonMoment`, `ClubSeasonSource`, `ClubSeasonSourceScope { METRICS EDITORIAL BOTH }`, and `DataCoverageStatus { COMPLETE PARTIAL UNKNOWN }`. Add nullable/back-relations to `Season`, `Team`, `Game`, `Competition`, and `MediaAsset` only where required. Use `onDelete: Cascade` from dossier to moments/sources, `Restrict` or `SetNull` toward canonical entities, `@@unique([seasonId, teamId])`, and indexes on dossier, moment date/order and source scope.

- [ ] **Step 4: Add the exact DTO families**

Define `SeasonDossierPayload`, `SeasonDossierMetric`, `SeasonDossierEvidenceGame`, `SeasonDossierMoment`, `SeasonDossierSource`, `SeasonDossierSquadPlayer`, and competition/game group types. Metrics use keys `matches`, `wins`, `goalsFor`, `leaguePosition`; values are `number | null`; coverage uses the three enum strings.

- [ ] **Step 5: Generate Prisma and verify**

Run: `npx prisma format && npx prisma generate && npm test -- --runInBand src/lib/__tests__/season-dossier-schema.test.ts && npx tsc --noEmit --incremental false`  
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat(seasons): add dossier data model`

### Task 2: Pure metric and evidence engine

**Files:**
- Create: `src/lib/season-dossier-metrics.ts`
- Create: `src/lib/__tests__/season-dossier-metrics.test.ts`

- [ ] **Step 1: Write failing metric tests**

Cover home and away wins, draws, zero scores, missing scores, `SCHEDULED` and `CANCELLED`, friendly competition API id 667, league/cup/Europe grouping, penalty shootout exclusion and evidence game IDs. Assert that no valid completed matches returns `null` for aggregate values rather than zero, while valid 0–0 returns zero goals.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier-metrics.test.ts`  
Expected: FAIL because `calculateSeasonMetrics` does not exist.

- [ ] **Step 3: Implement focused pure functions**

Export `isOfficialCompletedGame`, `resolveTeamScore`, `competitionBucket`, and `calculateSeasonMetrics(teamId, games, leaguePosition, sources, asOf)`. Filter competition types to `LEAGUE | CUP | EUROPE`, reject API id 667, use canonical non-penalty result fields, and return the same filtered evidence list and per-competition breakdown used by the headline values.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier-metrics.test.ts`  
Expected: all metric cases PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(seasons): calculate evidenced metrics`

### Task 3: Dossier assembly service and public API

**Files:**
- Create: `src/lib/season-dossier.ts`
- Create: `src/lib/__tests__/season-dossier.test.ts`
- Create: `src/app/api/mobile/v1/club/seasons/[seasonId]/route.ts`
- Create: `src/app/api/mobile/v1/club/seasons/[seasonId]/__tests__/route.test.ts`

- [ ] **Step 1: Write failing service tests**

Mock Prisma with deterministic 2025 and 2026 seasons. Assert pilot year gating, Beer Sheva lookup by `apiFootballId=563`, published-only editorial/moments for public calls, draft inclusion for admin calls, squad/coach/honors/standing grouping, evidence identity and current-season status.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier.test.ts`  
Expected: FAIL because `buildSeasonDossier` does not exist.

- [ ] **Step 3: Implement the assembler**

Implement `buildSeasonDossier(seasonId, { includeDrafts?: boolean } = {})`. Return `null` unless `season.year` is 2025 or 2026 and the season contains team 563. Batch independent queries with `Promise.all`, map only published content publicly, and call the pure metric engine once so values and evidence cannot diverge.

- [ ] **Step 4: Add Mobile API route and contract test**

Await route params, call the service, return JSON with status 200, and return `{ error: 'Season dossier not found' }` with 404 for non-pilot/missing rows. The route never enables `includeDrafts`.

- [ ] **Step 5: Verify**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier.test.ts 'src/app/api/mobile/v1/club/seasons/[seasonId]/__tests__/route.test.ts'`  
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat(seasons): expose shared dossier data`

### Task 4: Admin validation and CRUD

**Files:**
- Create: `src/lib/season-dossier-validation.ts`
- Create: `src/lib/__tests__/season-dossier-validation.test.ts`
- Create: `src/app/api/admin/club/seasons/[seasonId]/route.ts`
- Create: `src/app/api/admin/club/seasons/[seasonId]/moments/route.ts`
- Create: `src/app/api/admin/club/seasons/[seasonId]/moments/[id]/route.ts`
- Create: `src/app/api/admin/club/seasons/[seasonId]/sources/route.ts`
- Create: `src/app/api/admin/club/seasons/[seasonId]/sources/[id]/route.ts`
- Test: `src/app/api/admin/club/seasons/__tests__/routes.test.ts`

- [ ] **Step 1: Write validation and authorization tests**

Assert limits: intro 1,000 characters, summary 4,000, moment title 160, moment body 2,000, labels/provider 160, notes 1,000. Accept only absolute HTTP/HTTPS URLs. Reject a linked game outside the dossier season or not involving its team, a source competition outside the season, invalid dates and all non-admin mutations.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier-validation.test.ts src/app/api/admin/club/seasons/__tests__/routes.test.ts`  
Expected: FAIL because validators/routes do not exist.

- [ ] **Step 3: Implement validators**

Use narrow parsing functions that return typed values or a Hebrew validation error. Trim strings, normalize empty optional values to `null`, parse ISO dates strictly, and validate URL protocols with `new URL`.

- [ ] **Step 4: Implement protected routes**

Call `requireAdminUser()` before reading request bodies. Upsert the dossier by `seasonId_teamId`; set `publishedAt` only when transitioning to published. Mutate moments/sources only under the resolved dossier. Validate linked Game/Competition rows in the same Prisma transaction as the write. Return 400/403/404 without internal error text.

- [ ] **Step 5: Verify**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier-validation.test.ts src/app/api/admin/club/seasons/__tests__/routes.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat(admin): manage season dossiers`

### Task 5: Admin editor

**Files:**
- Create: `src/app/admin/club/seasons/[seasonId]/page.tsx`
- Create: `src/components/admin/SeasonDossierAdminClient.tsx`
- Modify: `src/app/admin/page.tsx`
- Test: `src/components/admin/__tests__/SeasonDossierAdminClient.test.tsx`

- [ ] **Step 1: Write the failing editor behavior test**

Render the client with a draft. Assert editing dossier text, draft/publish state, adding/removing/reordering a moment, associating a game, adding a source, showing server validation and never rendering inputs for calculated metric values.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/components/admin/__tests__/SeasonDossierAdminClient.test.tsx`  
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the protected Server Component**

Require admin, load `buildSeasonDossier(seasonId, { includeDrafts: true })`, and call `notFound()` outside the pilot. Serialize Dates to ISO strings before passing props.

- [ ] **Step 4: Implement the client editor**

Use separate forms for dossier, moments and sources so a failure cannot discard unrelated edits. Show character counts, publication state and calculated metric preview. Fetch the dedicated CRUD routes with credentials, display sanitized errors, and refresh local rows after success.

- [ ] **Step 5: Add admin navigation and verify**

Add a “תיקי עונה” card linking to the current pilot dossier. Run the focused component tests and `npx tsc --noEmit --incremental false`; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `feat(admin): add season dossier editor`

### Task 6: Public Web dossier

**Files:**
- Create: `src/app/club/seasons/[seasonId]/page.tsx`
- Create: `src/components/SeasonDossierClient.tsx`
- Modify: `src/app/club/seasons/page.tsx`
- Modify: `src/app/sitemap.ts`
- Test: `src/lib/__tests__/season-dossier-web.test.tsx`

- [ ] **Step 1: Write failing render tests**

Assert story-first section order, current/final labels, four metric buttons, `null` rendering as “לא ידוע”, evidence definition/coverage/sources/game links, published moment links, and a secondary archive link to filtered games.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/lib/__tests__/season-dossier-web.test.tsx`  
Expected: FAIL because the page/client do not exist.

- [ ] **Step 3: Implement the page**

Add dynamic metadata using season/team names. Render hero, metric grid, editorial/coverage row, sticky section links, timeline, squad, league context and grouped games. Use existing `MediaImage`, Link and card styles. Keep the page RTL and responsive without horizontal page overflow.

- [ ] **Step 4: Implement accessible evidence disclosures**

Each metric button uses `aria-expanded` and `aria-controls`; the disclosure has a heading, definition, coverage badge, source links, competition breakdown and evidence game links. Closing restores focus to the opener. Do not render external source content as HTML.

- [ ] **Step 5: Wire discovery**

For years 2025/2026, make the season name link to the dossier and add a separate “לכל המשחקים” link. Add the two dossier URLs to the sitemap using real season IDs resolved at generation time.

- [ ] **Step 6: Verify and commit**

Run focused tests, TypeScript and `npm run build`; expected PASS. Commit message: `feat(web): add season dossier pages`.

### Task 7: Native Mobile dossier

**Files:**
- Create: `mobile/hooks/useSeasonDossier.ts`
- Create: `mobile/app/club/seasons/[seasonId].tsx`
- Modify: `mobile/app/club/seasons.tsx`
- Create: `mobile/hooks/__tests__/useSeasonDossier.test.ts`
- Create: `mobile/app/club/seasons/__tests__/seasonId.test.tsx`

- [ ] **Step 1: Write failing hook and screen tests**

Assert query key includes season ID, request path is `/club/seasons/:id`, pilot rows navigate to the dossier, non-pilot rows keep the existing games behavior, current/final labels render correctly and metric presses open a dismissible RTL evidence modal with sources and game links.

- [ ] **Step 2: Verify red**

Run from `mobile/`: `npm test -- --runInBand hooks/__tests__/useSeasonDossier.test.ts app/club/seasons/__tests__/seasonId.test.tsx`  
Expected: FAIL because hook/screen do not exist.

- [ ] **Step 3: Implement hook and navigation**

Use `apiClient.get<SeasonDossierPayload>(\`/club/seasons/${encodeURIComponent(seasonId)}\`)`. The archive presses `/club/seasons/${seasonId}` only for years 2025/2026 and retains its existing season-store games route for other years.

- [ ] **Step 4: Implement native screen**

Use existing Header, Card, Section, theme, `rtlRow`, `absoluteImage` and BottomNav patterns. Render two-column metrics, story, horizontal section pills, timeline, squad, standing and grouped matches. Implement evidence as a React Native `Modal` with accessible close button, scrollable content and source links opened through `Linking` only for validated HTTP/HTTPS URLs.

- [ ] **Step 5: Verify and commit**

Run focused mobile tests from `mobile/`, then run `npx tsc --noEmit` from `mobile/`; expected PASS. Commit message: `feat(mobile): add season dossier screen`.

### Task 8: PostgreSQL integration, regression and delivery

**Files:**
- Create: `src/lib/__tests__/season-dossier.integration.test.ts`
- Modify: `.github/workflows/ci.yml` if an explicit integration toggle is needed
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/version.ts`
- Modify: `docs/reviews/2026-09-13-remediation-results.md`

- [ ] **Step 1: Write opt-in isolated-DB integration test**

Guard with `STATSAI_SEASON_DOSSIER_INTEGRATION=1` and require a localhost database named `statsai_review`. Create deterministic 2025/2026 fixtures, dossier/moment/source and games. Prove public draft filtering, metric/evidence agreement, cross-season link rejection and cascade safety; clean all fixtures.

- [ ] **Step 2: Run schema and integration test against disposable PostgreSQL**

Run `npx prisma db push` only with the isolated test URL, then run the opt-in suite. Expected: all cases PASS and production data untouched.

- [ ] **Step 3: Run full verification**

Run root TypeScript, full root Jest, Mobile TypeScript, full Mobile Jest, production build and `git diff --check`. Expected: no failures. Perform local production smoke checks for the archive page, both dossier pages and both Mobile API routes.

- [ ] **Step 4: Version and deployment notes**

Bump `package.json`, lockfile root version and `src/lib/version.ts` from `0.37.7` to `0.38.0`. Document that deployment requires `npx prisma db push --accept-data-loss && npx prisma generate` before build because schema changed.

- [ ] **Step 5: Review, commit and push**

Review the final diff for security, public draft leakage, duplicated metric logic and mobile/web contract drift. Commit with `feat(seasons): launch dossier pilot`, push `codex/project-security-review`, and report checks plus any residual limitations.

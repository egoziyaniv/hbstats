# Fan Features Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans task-by-task. Keep changes in the existing season-dossier-pilot worktree. Release each independently verified stage.

**Goal:** Deliver the approved fan roadmap, beginning with a subscribed club calendar and richer personal match history, then controlled historic dossiers, moderated fan archive, fan discovery tools, and a concrete admin redesign plan.

**Architecture:** Reuse Game/Team/User/ClubSeasonDossier and existing auth, media, editorial, and canonical venue services. Business calculations stay in pure helpers; server components compose data; APIs enforce ownership/admin roles. Prefer independent bounded implementations and review before release.

**Tech Stack:** Next 15, React 18, Prisma 5, TypeScript, Jest, Tailwind.

## 1. Calendar

Files: `src/lib/club-calendar.ts`, its tests, `src/app/api/calendar/hapoel-beer-sheva.ics/route.ts`, `src/app/club/calendar/page.tsx`, subscription client component; discovery links integrated by root.

- [ ] Write failing tests for stable UID on reschedule, cancellation, UTC/DST, escaping/folding Hebrew UTF-8, postponed/unknown time and home/away labels.
- [ ] Build pure serializer, retaining CANCELLED games and using authoritative provider status codes. Query HBS apiFootballId 563 across season rows; current+previous seasons plus future games. Exclude friendlies/unknown competition kinds.
- [ ] Add public GET, `text/calendar; charset=utf-8`, ETag/304 and bounded caching. GET must never mutate data.
- [ ] Add Hebrew subscription page with Apple webcal, Google URL subscription, copy HTTPS URL, privacy-free public feed and clear refresh limitations.
- [ ] Run focused Jest and TypeScript. Validate representative feed in independent parser if available. Do not claim actual calendar client synchronization without testing it.

## 2. My matchdays

Files: `src/lib/matchday-summary.ts`, tests, `src/app/matchdays/page.tsx`, attendance API/component and `prisma/schema.prisma` only for personal note.

- [ ] Write failing pure tests for scored/conceded, home/away completed games, canonical unique venues and null values.
- [ ] Add totals and season/home-away/venue filters, retaining overall vs filtered counts with explicit labels.
- [ ] Add optional private plain-text memory, max 1000 chars; authenticated owner-scoped GET/PUT. Removing attendance removes its note. Maintain existing attendance API compatibility.
- [ ] Test unauthenticated access, ownership, input length, note persistence, filtering and unknown venue handling.

## 3. Historic dossiers and evidence

Files: `src/lib/season-dossier.ts`, validation, archive/admin routes and relevant tests.

- [ ] Inspect existing pilot-year guard and admin publication workflow.
- [ ] Replace hardcoded year whitelist with controlled eligibility: preserve two pilot years and require published dossier for additional public seasons; admin can create/edit HBS historical seasons.
- [ ] Historical unverified coverage remains PARTIAL/UNKNOWN; no generated editorial claims.
- [ ] Update discovery and tests for hidden draft vs published historical dossier, cross-team checks, and mobile API parity.
- [ ] Reuse existing evidence UI for record categories only where underlying games can reproduce the metric; do not fabricate evidence for unsupported legacy aggregates.

## 4. Fan archive

Files: focused archive model/service/public pages/admin queue/owner APIs/components/tests.

- [ ] Reuse existing MediaAsset/upload validations where suitable; otherwise use validated existing public image links for first pilot and document limits.
- [ ] Add item type/title/body/date/credit/source/permission and optional game/season/player/venue links with DRAFT/PENDING/PUBLISHED/REJECTED status.
- [ ] Authenticated submissions are private until admin approval. Server checks ownership, lengths, URLs, entity links and permission before publication.
- [ ] Add public archive listing/detail, personal submission page and admin moderation queue.
- [ ] Test public visibility, owner/admin authorization, invalid input and state transitions.

## 5. Fan discovery

- [ ] Inspect existing game preparation and club/history pages to reuse them.
- [ ] Add coherent HBS matchday destination linking current fixture, availability, head-to-head, and a real past meeting; no invented near-record claims.
- [ ] Add era navigation over published existing club editorial content, with source/entity links where present.
- [ ] Add curated quiz only with explicit supported answers and evidence from known game records, and a shareable fact view/image with scope/date/source.
- [ ] Test evidence derivation and private-data exclusion.

## 6. Admin redesign specification

- [ ] Inventory actual admin routes, permissions and common workflows after features land.
- [ ] Write concrete navigation map, desktop/mobile layouts, overview priorities, filter persistence, table/edit patterns, source provenance and job status flows.
- [ ] Preserve existing URLs and server API role checks. Separate drafts/publication and previews/destructive operations.
- [ ] Provide staged migration plan and acceptance criteria. This task is design, not an admin rewrite.

## Release checks

- [ ] Focused suites, TypeScript, Prisma validation/generation on schema changes, diff check and code review.
- [ ] Both app version files agree; commit/push authorized by user.
- [ ] Production build must succeed before restart. On schema changes back up DB, inspect schema diff and apply additive changes before build; never force destructive schema changes.
- [ ] Verify public pages and API after restart. Report untested external clients and remaining content work accurately.

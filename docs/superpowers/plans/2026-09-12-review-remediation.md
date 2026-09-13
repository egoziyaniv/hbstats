# Review remediation implementation plan

**Goal:** Address the 12 confirmed code/security findings in `docs/reviews/2026-09-12-code-security-review.md` on the existing review branch.

**Architecture:** Preserve the current schema and UI. Bind access JWTs to persisted device sessions, make refresh rotation atomic, and retain controlled retry idempotency. Preserve partial-data safeguards while correcting explicit game edits. Fail closed when secure storage is unavailable. Upgrade vulnerable dependencies with the necessary Next.js API compatibility changes.

**Stack:** Next.js, Prisma/PostgreSQL, Jest, Expo SecureStore.

User has authorized implementation of the reviewed recommendations; no further design approval is required. Independent owners work on separate files, followed by integration review. No production database operations or deployment are part of this change.

## Work units and acceptance checks

- [x] Server auth — `src/lib/auth.ts`, `jwt.ts`, auth routes and tests: concurrent refresh, revoked bearer, inactive refresh and initial admin races are covered; rotation is transactional and bearer access is bound to a persisted session. Legacy JWTs must refresh or reauthenticate and cannot bypass revocation.
- [x] Data integrity — `merge-engine.ts`, `standings-from-games.ts`, `goal-timing.ts`, games route and tests: enrichment rollback, cancellation/delete/move and inconsistent event names are covered, including four opt-in tests against isolated PostgreSQL.
- [x] Mobile — `mobile/lib/auth.ts`, `contexts/AuthContext.tsx`, tests: plaintext credential fallback was removed, rejected sessions clear authenticated state and query-test handles are disposed. All mobile tests and typecheck pass.
- [x] AI — chat route + regression tests: per-message/body/context validation and persisted per-user/global daily admission limits are implemented and tested before provider invocation.
- [x] Cron — shell dotenv extraction was replaced by a Node wrapper using Next's env loader, endpoint allowlisting, timeout and HTTP failure handling. Both crontab entries use it.
- [x] Dependencies — audit before/after completed; Next and the Anthropic SDK were upgraded and Next 15 async APIs migrated. Residual advisories and why automated fixes are unsafe are documented in the remediation results.
- [x] Verification — isolated PostgreSQL, Prisma schema sync there only, complete backend/mobile suites, both typechecks, production build and final diff checks passed.
- [x] Delivery — both app version sources are `0.37.7`, CI now builds production, and reauthentication/deployment considerations and actual results are documented. Changes remain local and reviewable on the requested branch.

For each behavioral fix: failing test first, observe the expected failure, minimal fix, then rerun. Existing before-change npm audit results are the dependency regression baseline. Tests use synthetic data; no production secrets are printed or used for external services.

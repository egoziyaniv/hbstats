# Roster and archive follow-up implementation plan

> Continue the approved September 23 roster integrity design. User approved implementation on September 27 and specified rejection must not suppress future sync suggestions. Execute with subagent-driven-development for isolated admin implementation and review.

**Goal:** Finish roster review controls, audit and fill supported club archive gaps, then expose safe player duplicate candidates for review.
**Architecture:** Preserve the JSON status model and historical records. Use optimistic concurrency for admin writes. Audit archive coverage read-only before narrowly scoped imports. Never merge ambiguous player identities automatically.

- [ ] Roster: test approval/edit/rejection, authorization, validation and stale-row handling; implement authenticated endpoint and Hebrew inline controls preserving unrelated fields.
- [ ] Archive: test missing seasons, league-scoped completed-game counts, duplicate fixtures and unknown coverage; implement read-only reproducible production audit and save report.
- [ ] Archive: inspect raw-source gaps; collect missing data when source supports it, preview before merge, verify counts after any write.
- [ ] Duplicates: test missing identity/conflicting DOB and already-linked families; audit candidates with evidence and offer administrator review without deleting historical rows.
- [ ] Review implementation against requirements then correctness/security; run focused tests, typecheck, full tests and build; align versions before any push.

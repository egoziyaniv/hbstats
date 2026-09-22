# Roster integrity and player identity design

## Goal
Keep every current-season squad accurate without deleting historical player, match, media, or statistics data. Each player row can be active, loaned, sold, or departed, with a Hebrew destination, effective date, source URL, and confidence. Public team pages show active players first and a separate, labeled mid-season movement section only when appropriate.

## Roster status model
Status remains in `Player.additionalInfo.rosterStatus` so no schema migration is required. It contains:

- `kind`: `LOAN`, `SOLD`, or `DEPARTED`; absent means active.
- `destinationNameHe`: optional destination club.
- `effectiveDate`: ISO date when known.
- `sourceUrl`: evidence link.
- `confidence`: `VERIFIED` or `REVIEW`.
- `showInSquadArchive`: false for stale provider rows that never belonged to the season squad.

`additionalInfo.departed` remains true for backwards-compatible existing filters. A future status update always preserves unrelated JSON fields.

## Data flow
1. Fetch current-season transfer records from API-Football for every team with an API ID.
2. Match transfer players to roster records through API ID first; then a canonical family; then a strict name-plus-birth-date match.
3. Create a dry-run report grouped into verified movements, review-required movements, and missing source data.
4. Apply only verified movements in one transaction. Each result is reversible by clearing the structured status.
5. Render active roster rows once per canonical family. Show loan/sold/departed entries in the bottom movement section only if `showInSquadArchive` is not false.

## Duplicate detection and merging
The audit runs on every current-season team and compares independent canonical families from API-Football, SofaScore and Flashscore.

A merge is automatic only when an API-Football ID is identical, or when first name, last name and birth date agree exactly. It links the weaker family root to the selected canonical root; it never deletes player rows, events, lineups, media, or statistics. The selected canonical root prioritizes API-Football identity, then the family containing the most match records.

All weaker evidence stays in the review report: normalized name-only matches, matching photos, or positions without a matching birth date.

## Admin review
Add one compact admin integrity page with three sections:

- verified actions ready to apply;
- duplicate candidates requiring approval;
- roster discrepancies with source, suggested status, and evidence.

A reviewer can approve, reject, or override each candidate. Apply actions retain source evidence and timestamp.

## Validation
- Unit tests for status parsing, strict duplicate confidence, and display filtering.
- Dry-run report on production before any write.
- Verify no `Player`, event, lineup, media, or statistic records are deleted.
- Type check, production build, HTTP checks for team and player pages after deployment.

## Scope boundaries
The first delivery covers the current season and all teams. Historic seasons are unchanged except when a duplicate family is linked to preserve their existing records.

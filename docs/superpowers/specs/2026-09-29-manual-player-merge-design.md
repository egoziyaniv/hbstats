# Manual player merge design

## Goal

Let an administrator resolve a displayed duplicate on the existing `/admin/player-duplicates` page without deleting historical source rows, game records, or provider identifiers.

## Interaction

Each candidate row gets an **"איחוד ידני"** action. Its dialog preselects the record with more events and lineup entries as the primary record. The administrator can change that choice, select only missing primary fields to copy from the secondary record, inspect the resulting values, and confirm the merge. The default selected copy fields are a missing birth date, nationality, position, photo, and first/last-name components when the secondary value is present.

The dialog displays a concise before/after preview, primary and secondary IDs, and a warning that conflicting nonempty values are never copied automatically. It does not offer an automatic merge for any candidate.

## Data model and atomic action

The action links the secondary family root to the selected primary root via `canonicalPlayerId`. If the secondary root already has children, every member is reparented to the selected primary root. Existing events, lineups, statistics, media, and supplier records keep their `playerId`; the existing family-aware pages aggregate them through `canonicalPlayerId`.

Selected field copies only fill `null` or empty primary values. The server re-reads both roots in a transaction and rejects a stale page timestamp, already-shared family, cross-season pair, or a secondary record that is not a candidate in the selected current season. `ActivityLog` saves the primary, secondary, copied field names, and pre-merge canonical links.

## Undo

The dialog's success message includes **"ביטול האיחוד"**. The undo request uses the logged pre-merge links and field values, checks the affected rows have not changed since the merge, restores only the values written by that merge, and reverts family links. A later manual edit or a subsequent merge blocks undo and requires a new review.

## Validation

- Route tests cover administrator access, required pair membership, selected-field allowlist, stale writes, non-destructive links, and undo.
- Pure helper tests cover default keeper choice and copy-only-if-empty behavior.
- Client rendering test covers preview and confirmation controls.
- Run focused Jest tests, TypeScript checking, `git diff --check`, and production build before deployment.

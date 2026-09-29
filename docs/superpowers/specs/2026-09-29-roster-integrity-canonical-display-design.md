# Canonical-player display in roster integrity

## Purpose

`/admin/roster-integrity` must show a single review row for one person, even
when the database contains several source rows connected through
`canonicalPlayerId`.  The screen currently renders each source row with a
roster status, which makes a confirmed move such as Itay Hazut appear several
times.

## Design

The page will load each player’s `canonicalPlayerId`, then group roster-status
rows by a family key: the canonical id when present, otherwise the player id.
Each family contributes one row.

The displayed identity is the canonical player when that player is available in
the selected season; otherwise the group uses the member with the newest
roster-status update.  Status selection uses the newest explicit status update;
ties use the stable player id.  Counts, filters, links and edit controls all
operate on the grouped rows, so a family is counted once and searching any
member can still find the group.

The action control retains the id and `updatedAt` of the source record that
provided the visible status.  Approve, edit and reject therefore continue to
make exactly the same guarded write as today; grouping does not copy, delete or
move player, match, lineup or statistics data.

Self-referential canonical links are treated as roots for display.  This keeps
one malformed link from hiding a status, while separate repair work can correct
the relationship later.

## Validation

Unit tests will cover grouping normal members, choosing the newest status,
searching with an alias, and self-linked rows.  Existing roster-status action
tests remain the regression check that edit and approval writes retain their
optimistic-lock protection.

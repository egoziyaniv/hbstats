# Drive Match Photos Implementation Plan

> Execute inline in the isolated worktree using executing-plans. The user approved the import design.

**Goal:** Create a reviewable PR with a source inventory, verified photos, and safe imports into existing game galleries.

**Architecture:** A private JSON manifest records original Drive references, capture evidence, review status and local derivative hashes. A Node CLI validates local files and fixtures before importing MediaAsset records. All private metadata, images and raw archives remain ignored; only aggregate counts enter the public repository.

**Tech Stack:** Node.js built-in test runner, crypto, fs, Prisma; existing image gallery.

- [x] Discover candidate photos and inspect contact sheets; keep unrelated screenshots excluded. Searches found 5,219 candidates; 1,140 were inspected in this batch. The remaining 4,079 candidates are explicitly outside this reviewed batch.
- [x] Test matching of capture calendar dates, HBS-only fixtures, missing and ambiguous fixtures, and blocked/unreviewed records using `node --test scripts/drive-photos/import.test.js` (9 passing).
- [x] Implement `scripts/drive-photos/import.js` with dry run default, explicit --apply, safe local paths, hash verification and deterministic media IDs. Render reviewed derivatives without EXIF/GPS under ignored public/uploads/games/drive-photos.
- [x] Save a reviewed private `data/drive-photos/manifest.json` in the media bundle and document source discovery, exclusions, pending review, archive download fallback and deployment file-transfer instructions in `scripts/drive-photos/README.md`.
- [x] Run focused tests, local database dry run (383 photos / 14 games), isolated PostgreSQL apply/reapply/rollback (383 created, 0 duplicated, 0 remaining), and `git diff --check`. Bump both version files. The existing local database lacks gameId, so its schema was left unchanged.
- [ ] Commit task files, push branch and open the requested PR.

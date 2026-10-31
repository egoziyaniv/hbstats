# One-off data fixes, 31.10.2026

Already applied on production. Kept as the record of where the data came from and how to rerun it.
Every script writes to the `data_import_changes` ledger, so `node scripts/eyal-archive/rollback.js
--source <source> --all --apply` undoes it. Run from the repo root on the server, dry run first, then `--apply`.

The source is football.org.il (IFA), which sits behind Cloudflare. Rounds 23-33 were transcribed from
screenshots the owner took in a browser. In IFA's round lists, a result `x - y` means away x, home y. Every
season was checked: the table computed from its games equals IFA's table after round 33, row by row.

| Script | Ledger source | What it did |
|---|---|---|
| `ligat-haal-2019-20-final-round.js` | `eyal-archive` (basis `book-table-fix`) | The 2019-20 upper play-off table had stopped at 35 games; adds round 36, and gives 3 games their round |
| `leumit-2006-07-games.js` + `leumit-2006-r23-33.json` | `ifa-leumit-2006` | Rounds 1-22 from `scraped_matches` and 23-33 from screenshots: 93 games created, so all 198 are held; Nazareth Illit row → Nof HaGalil |
| `leumit-2006-07-table-from-games.js` | `ifa-leumit-2006` | The table recomputed from the 198 games (BS −1 point, H. Jerusalem −2) |
| `leumit-2006-07-bs-referees.js` | `ifa-leumit-2006` | Full referee crews, BS rounds 23-33 |
| `leumit-2007-08-games.js` + json | `ifa-leumit-2007` | Rounds 23-33 (56 games); removes 2 duplicates caused by the Nazareth Illit row; r33 referee crew |
| `leumit-2007-08-bs-referees.js` | `ifa-leumit-2007` | Referee crews, BS rounds 23-32; the r32 goal (the book lacks the game) |
| `leumit-2008-09-games.js` + json | `ifa-leumit-2008` | Rounds 23-33 (56 games) |
| `leumit-2008-09-bs-referees.js` | `ifa-leumit-2008` | Referee crews, BS rounds 23-33; the 5 goals of r32 (the book lacks the game) |
| `ligat-haal-2000-05-fold-table-only-teams.js` | `team-fold` | 10 clubs held twice in a season (games on one team row, table on another) folded into one |
| `bs-squads-2003-06.js` + json | `ifa-squads-bs` | BS squads 2003/04-2005/06 from IFA team pages the owner saved: 42 players created, 35 scorers tagged with their IFA id |
| `bs-squad-photos-2003-06.js` + map | `ifa-squads-bs` | 74 photos linked; the image files live in `public/uploads/players/{year}/hapoel-beer-sheva/` on the server only (uploads are not in git) |

The games scripts refer to team rows by id; they belong to the production database and won't match elsewhere.

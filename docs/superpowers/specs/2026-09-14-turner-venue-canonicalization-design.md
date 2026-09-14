# Turner venue canonicalization

## Goal

Represent Toto Turner Stadium as one venue across historical imports while preserving existing public venue links.

## Canonical identity

The venue with API-Football ID `867` is canonical. Its public labels are `אצטדיון טוטו טרנר` and `Yaakov Turner Toto Stadium`, with Beer Sheva as the city. Three known duplicate IDs resolve to the canonical ID; Turner's Cross in Cork remains unrelated.

## Data repair

The repair command runs as a dry-run unless passed `--execute`. In one database transaction it moves games, teams, and media from the three duplicate rows, links games carrying an explicit Turner name without a `venueId`, normalizes labels, and deletes the empty duplicate rows. Games with no venue evidence remain unchanged.

## Recurrence prevention

API-Football venue ingestion and the venue rebuild script normalize the known Turner names to API-Football ID `867` before lookup or creation. Public web and mobile venue reads resolve the former IDs so saved links continue to work.

## Verification

Unit tests cover every accepted name, the canonical API ID, legacy links, and the unrelated Cork stadium. Deployment verification compares pre/post relation counts and checks the old and canonical live URLs.

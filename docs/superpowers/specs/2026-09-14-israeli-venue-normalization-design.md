# Israeli venue normalization

## Goal

Present one reliable record for each Israeli stadium, keep historic venue URLs working, use Hebrew labels throughout the venue catalogue, and show sourced stadium photography where a reusable image is available.

## Identity rules

- Merge only curated aliases backed by identical base names, city suffix variants, or a verified former/commercial name.
- Keep training grounds, artificial pitches, and nearby stadiums separate unless the source records identify the same physical venue.
- Prefer the record with an API-Football identifier as the canonical record. Preserve games, team links, uploaded media, and alias-only metadata when deleting aliases; report conflicting metadata in the dry-run.
- Resolve deleted IDs to their canonical IDs so saved public links continue to work.
- Apply the same identity catalogue during future API fetches and venue rebuilds.

## Hebrew and images

- Translate every venue used in an Israeli competition, linked to an Israeli team, or marked as Israeli, and normalize its city and country labels.
- Use specific Hebrew names for named stadiums and a deterministic Hebrew label for municipal, training, and synthetic grounds.
- Use Wikimedia Commons images only with the file page, creator, license, and license URL stored alongside the image URL. Show linked attribution wherever the venue image is presented on web and mobile.
- Preserve an existing image by default. Replacing confirmed placeholders requires the explicit `--replace-images` flag.

## Rollout

The maintenance command is dry-run by default. Execution runs in one database transaction, preserves conflicting alias metadata as provenance, then refuses success if aliases, missing Hebrew translations, or pending image updates remain. A fresh production backup is required before execution.

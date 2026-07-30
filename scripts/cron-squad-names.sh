#!/bin/bash
# Weekly squad-name maintenance (runs after the sofascore-squads + photos crons):
#   1. link current Ligat Ha'al players to their API-Football id (so new
#      signings added by the squad crons link in game imports), then
#      2. apply Walla's authoritative Hebrew names.
# Season is auto-detected (current Israeli season) by both scripts.
set -e
cd /home/hbs/hbstats || exit 1
echo "=== $(date -u +%FT%TZ) cron-squad-names ==="
/usr/bin/node scripts/backfill-apifootball-ids.js --execute
/usr/bin/node scripts/scrape-walla-squad.js --all --execute
echo "=== done ==="

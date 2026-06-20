#!/bin/bash
# cron-matchday.sh — keep the live season self-updating.
#
# Runs daily. For TODAY's date it refreshes any Israeli-league games that were
# played (results, events, lineups, statistics) straight from API-Football and
# enriches them with IFA Hebrew details, then re-pulls the league tables.
#
# Deliberately skips the two browser/Cloudflare-bound sources so it is safe to
# run unattended on the server:
#   --no-footystats  (FootyStats sits behind Cloudflare; needs a headful browser)
#   --no-walla       (Walla scrape needs Puppeteer/Chrome)
# API-Football + IFA already cover results, events, lineups, stats and Hebrew
# match details. On days with no games matchday-update simply finds 0 fixtures
# and does nothing, so this is cheap to run year-round.
#
# Suggested crontab entry (hbs user):
#   15 1 * * *  /home/hbs/hbstats/scripts/cron-matchday.sh >> /home/hbs/logs/matchday.log 2>&1

set -uo pipefail
cd /home/hbs/hbstats

# Current season start year: month >= 7 (Aug window) -> this year, else last year.
YEAR=$(date -u +%Y)
MONTH=$(date -u +%-m)
if [ "$MONTH" -lt 7 ]; then SEASON=$((YEAR - 1)); else SEASON=$YEAR; fi

echo "═══ $(date -u +%Y-%m-%dT%H:%M:%SZ) — matchday update (season ${SEASON}) ═══"

# 1. Refresh today's played games across both Israeli divisions.
node scripts/matchday-update.js --league all --no-footystats --no-walla 2>&1 \
  || echo "[matchday-update] failed"

# 2. Re-pull the league tables (Ligat HaAl + Liga Leumit).
node scripts/refetch_standings.js "$SEASON" 383 2>&1 || echo "[standings 383] failed"
node scripts/refetch_standings.js "$SEASON" 382 2>&1 || echo "[standings 382] failed"

echo "═══ $(date -u +%Y-%m-%dT%H:%M:%SZ) — done ═══"

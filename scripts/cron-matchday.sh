#!/bin/bash
# cron-matchday.sh — keep the live season self-updating.
#
# Runs daily. First it re-reads the fixture SCHEDULE from API-Football, because the
# season fixture list is imported months ahead with one placeholder slot per round and
# the league later staggers each round across Saturday/Sunday/Monday. Stale kickoff
# times broke everything downstream: matchday-live.js watches a window around kickoff,
# so it opened the window on the wrong day and a whole matchday was never collected.
#
# Then, for TODAY and the THREE PRECEDING DAYS, it refreshes any Israeli-league games
# that were played (results, events, lineups, statistics) from API-Football and enriches
# them with IFA Hebrew details, then re-pulls the league tables. The look-back matters:
# this runs at 01:15 UTC, when nothing played later that day has kicked off yet, so
# looking only at today could never pick a result up — and any matchday missed for a
# different reason now self-heals within three days.
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

# 1. Re-read the schedule so kickoff times (and any result we never stored) are current.
node scripts/refresh-fixture-schedule.js 2>&1 || echo "[refresh-fixture-schedule] failed"

# 2. Refresh played games across both Israeli divisions — today and the 3 days before,
#    so an evening matchday is picked up the following night.
for BACK in 3 2 1 0; do
  DAY=$(date -u -d "${BACK} days ago" +%F)
  echo "--- matchday-update ${DAY} ---"
  node scripts/matchday-update.js --date "$DAY" --league all --no-footystats --no-walla 2>&1 \
    || echo "[matchday-update ${DAY}] failed"
done

# 3. Re-pull the league tables (Ligat HaAl + Liga Leumit).
node scripts/refetch_standings.js "$SEASON" 383 2>&1 || echo "[standings 383] failed"
node scripts/refetch_standings.js "$SEASON" 382 2>&1 || echo "[standings 382] failed"

echo "═══ $(date -u +%Y-%m-%dT%H:%M:%SZ) — done ═══"

#!/bin/bash
# cron-refresh-ai.sh — nightly refresh of AI summaries.
#
# Intended for the production server's crontab. Refreshes both team-overview
# narratives and player narratives for the current season. Logs to
# /var/log/hbstats/ai-refresh.log (rotated by the OS via logrotate, or just
# truncate manually).
#
# Crontab entry suggested:
#   30 3 * * *  /home/hbs/hbstats/scripts/cron-refresh-ai.sh >> /var/log/hbstats/ai-refresh.log 2>&1

set -euo pipefail

cd /home/hbs/hbstats

echo "═══ $(date -u +%Y-%m-%dT%H:%M:%SZ) — starting AI refresh ═══"

# Team overviews (every active team for the current season).
node scripts/fetch-team-overviews.js --only ai 2>&1 || echo "[team-overviews] failed"

# Player overviews — only Ligat HaAl, limit 500. This is the heavy one.
node scripts/fetch-player-overviews.js --limit 500 2>&1 || echo "[player-overviews] failed"

echo "═══ $(date -u +%Y-%m-%dT%H:%M:%SZ) — done ═══"

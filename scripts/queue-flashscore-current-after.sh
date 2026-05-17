#!/usr/bin/env bash
#
# One-off follow-up: waits for the main flashscore queue PID to exit, then
# re-runs the current-season refresh (fixtures + missing match details + merge)
# to cover the steps that failed during the original kickoff due to a transient
# Postgres outage at 08:33.
#

set -u
cd "$(dirname "$0")/.."

WAIT_PID="${1:-37093}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="logs/flashscore-queue/current-refresh-$STAMP"
mkdir -p "$LOG_DIR"
QUEUE_LOG="$LOG_DIR/queue.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$QUEUE_LOG"; }

log "=== Waiting for queue PID $WAIT_PID to finish ==="

# Poll every minute. ps returns 0 only while the process is alive.
while ps -p "$WAIT_PID" > /dev/null 2>&1; do
  sleep 60
done

log "PID $WAIT_PID has exited. Starting current-season refresh."

run_step() {
  local label="$1"; shift
  log ">>> $label"
  if "$@" >> "$LOG_DIR/detail.log" 2>&1; then
    log "    ✓ $label"
  else
    log "    ✗ $label (exit $?)"
  fi
}

run_step "fixtures (ligat-ha-al / current)" \
  node scripts/scrape-flashscore-fixtures.js --league-slug ligat-ha-al --season 2025-2026
run_step "match details (--all-missing, limit 5000)" \
  node scripts/scrape-flashscore-match.js --all-missing --limit 5000
run_step "merge to main DB" \
  node scripts/rebuild/44-flashscore-enrichment.js --apply

log "=== Current-season refresh complete ==="

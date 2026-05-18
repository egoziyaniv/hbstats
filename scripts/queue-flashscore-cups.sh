#!/usr/bin/env bash
#
# Cup follow-up: waits for the in-flight current-refresh wrapper (or any
# given PID) to exit, then runs the three Israeli cup competitions across
# 2020-2026: גביע המדינה (state-cup), אלוף האלופים (super-cup) and גביע הטוטו
# (toto-cup). Each entry runs fixtures → missing match details → merge,
# identical to the main seasons queue.
#
# Pass the PID to wait for as the first argument, or omit to start now.
# Usage:
#   ./scripts/queue-flashscore-cups.sh 40490 &
#   ./scripts/queue-flashscore-cups.sh &        # no wait
#

set -u
cd "$(dirname "$0")/.."

WAIT_PID="${1:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="logs/flashscore-queue/cups-$STAMP"
mkdir -p "$LOG_DIR"
QUEUE_LOG="$LOG_DIR/queue.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$QUEUE_LOG"; }

if [ -n "$WAIT_PID" ]; then
  log "=== Waiting for PID $WAIT_PID to exit before starting cups queue ==="
  while ps -p "$WAIT_PID" > /dev/null 2>&1; do
    sleep 60
  done
  log "PID $WAIT_PID exited. Starting cups queue."
fi

# Sequential list of (slug, season) pairs to process. Slug conventions per
# Flashscore: current-season has no year suffix, historical state-cup /
# toto-cup append "-YYYY-YYYY", super-cup appends single year "-YYYY".
ENTRIES=(
  # גביע המדינה — State Cup
  "state-cup-2020-2021:2020-2021"
  "state-cup-2021-2022:2021-2022"
  "state-cup-2022-2023:2022-2023"
  "state-cup-2023-2024:2023-2024"
  "state-cup-2024-2025:2024-2025"
  "state-cup:2025-2026"
  # אלוף האלופים — Super Cup (single-year suffix)
  "super-cup-2020:2020-2021"
  "super-cup-2021:2021-2022"
  "super-cup-2022:2022-2023"
  "super-cup-2023:2023-2024"
  "super-cup-2024:2024-2025"
  "super-cup:2025-2026"
  # גביע הטוטו — Toto Cup
  "toto-cup-2020-2021:2020-2021"
  "toto-cup-2021-2022:2021-2022"
  "toto-cup-2022-2023:2022-2023"
  "toto-cup-2023-2024:2023-2024"
  "toto-cup-2024-2025:2024-2025"
  "toto-cup:2025-2026"
)

run_step() {
  local label="$1"; shift
  local log_file="$1"; shift
  log ">>> $label"
  if "$@" >> "$log_file" 2>&1; then
    log "    ✓ $label"
    return 0
  else
    local rc=$?
    log "    ✗ $label (exit $rc — continuing to next step)"
    return $rc
  fi
}

log "=== Cups queue starting (${#ENTRIES[@]} cup × season combinations) ==="
log "Queue log: $QUEUE_LOG"

idx=0
for entry in "${ENTRIES[@]}"; do
  idx=$((idx + 1))
  IFS=':' read -r slug season <<< "$entry"
  season_log="$LOG_DIR/$(printf '%02d' "$idx")-$slug.log"
  log ""
  log "===== [$idx/${#ENTRIES[@]}] $slug / $season ====="
  log "Detail log: $season_log"
  run_step "fixtures ($slug)" "$season_log" \
    node scripts/scrape-flashscore-fixtures.js --league-slug "$slug" --season "$season"
  run_step "match details (--all-missing, limit 5000)" "$season_log" \
    node scripts/scrape-flashscore-match.js --all-missing --limit 5000
  run_step "merge to main DB" "$season_log" \
    node scripts/rebuild/44-flashscore-enrichment.js --apply
  log "===== [$idx/${#ENTRIES[@]}] $slug / $season DONE ====="
done

log ""
log "=== Cups queue finished ==="

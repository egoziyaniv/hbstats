#!/usr/bin/env bash
#
# Queue Flashscore imports for the current + past seasons, running each
# pipeline (fixtures → missing match details → merge) sequentially. Designed
# to be launched in the background and left to run for several hours.
#
# Edit the SEASONS array below to choose which seasons to import. Format:
#   "<flashscore-slug>:<season-folder>"
# - Current-season slug has no year suffix (Flashscore convention).
# - Historical seasons append "-YYYY-YYYY".
#
# Logs land in logs/flashscore-queue/<timestamp>/.
# Watch progress with:   tail -f logs/flashscore-queue/<timestamp>/queue.log
#

set -u
cd "$(dirname "$0")/.."

# Sequential list of (slug, season) pairs to process.
# Tweak this list before running if you want a different scope.
SEASONS=(
  "ligat-ha-al:2025-2026"
  "ligat-ha-al-2024-2025:2024-2025"
  "ligat-ha-al-2022-2023:2022-2023"
  "ligat-ha-al-2021-2022:2021-2022"
  "ligat-ha-al-2020-2021:2020-2021"
)

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="logs/flashscore-queue/$STAMP"
mkdir -p "$LOG_DIR"
QUEUE_LOG="$LOG_DIR/queue.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$QUEUE_LOG"
}

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

log "=== Flashscore queue starting (${#SEASONS[@]} seasons) ==="
log "Queue log:  $QUEUE_LOG"

idx=0
for entry in "${SEASONS[@]}"; do
  idx=$((idx + 1))
  IFS=':' read -r slug season <<< "$entry"
  season_log="$LOG_DIR/$(printf '%02d' "$idx")-$slug.log"
  log ""
  log "===== [$idx/${#SEASONS[@]}] $slug / $season ====="
  log "Detail log: $season_log"
  run_step "fixtures ($slug)" "$season_log" \
    node scripts/scrape-flashscore-fixtures.js --league-slug "$slug" --season "$season"
  run_step "match details (--all-missing, limit 5000)" "$season_log" \
    node scripts/scrape-flashscore-match.js --all-missing --limit 5000
  run_step "merge to main DB" "$season_log" \
    node scripts/rebuild/44-flashscore-enrichment.js --apply
  log "===== [$idx/${#SEASONS[@]}] $slug / $season DONE ====="
done

log ""
log "=== Flashscore queue finished ==="

#!/usr/bin/env bash
#
# Nightly PostgreSQL backup for StatsAI (C-3).
#
# Creates a compressed pg_dump, verifies it, rotates old copies, and — if a
# remote target is configured — ships a copy off-server.
#
#   Retention: all dumps from the last KEEP_DAILY days, plus Sunday dumps for
#              KEEP_WEEKLY days (so a bad day discovered late is still recoverable).
#   Off-server: set BACKUP_REMOTE in the environment (an rsync target such as
#              "u123@u123.your-storagebox.de:backups/" or "user@host:/path/").
#              Until then backups are LOCAL ONLY and do not survive disk loss.
#
# Install (on the server, as user hbs):
#   mkdir -p ~/backups ~/logs
#   crontab -e   →   0 2 * * * /home/hbs/hbstats/scripts/backup-db.sh >> /home/hbs/logs/db-backup.log 2>&1
#
# Restore a dump:
#   pg_restore --no-owner --no-privileges -d "$DATABASE_URL" ~/backups/hbs_YYYYMMDD_HHMMSS.dump
set -euo pipefail

APP_DIR="${APP_DIR:-/home/hbs/hbstats}"
BACKUP_DIR="${BACKUP_DIR:-/home/hbs/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-90}"

# Load DATABASE_URL from the app's .env. We extract just this one key rather
# than sourcing the whole file — .env contains unquoted values with spaces
# (e.g. API_FOOTBALL_TEAM_NAME) that would break `. .env` under `set -e`.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env" ]; then
  line="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1)"
  DATABASE_URL="${line#DATABASE_URL=}"
  DATABASE_URL="${DATABASE_URL%\"}"; DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"; DATABASE_URL="${DATABASE_URL#\'}"
  export DATABASE_URL
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "$(date '+%F %T') ERROR: DATABASE_URL not set" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y%m%d_%H%M%S')"
OUT="$BACKUP_DIR/hbs_${STAMP}.dump"

echo "$(date '+%F %T') starting backup → $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f "$OUT"

# Integrity: non-empty, valid custom-format header, and a readable TOC.
if [ ! -s "$OUT" ] || [ "$(head -c 5 "$OUT")" != "PGDMP" ]; then
  echo "$(date '+%F %T') ERROR: dump missing or not a valid PGDMP file" >&2
  rm -f "$OUT"
  exit 1
fi
if ! pg_restore -l "$OUT" >/dev/null 2>&1; then
  echo "$(date '+%F %T') ERROR: dump TOC unreadable — corrupt backup" >&2
  rm -f "$OUT"
  exit 1
fi
SIZE="$(du -h "$OUT" | cut -f1)"
echo "$(date '+%F %T') backup OK ($SIZE)"

# Off-server copy (only if configured)
if [ -n "${BACKUP_REMOTE:-}" ]; then
  if rsync -a "$OUT" "$BACKUP_REMOTE"; then
    echo "$(date '+%F %T') shipped off-server → $BACKUP_REMOTE"
  else
    echo "$(date '+%F %T') WARNING: off-server copy to $BACKUP_REMOTE failed" >&2
  fi
else
  echo "$(date '+%F %T') NOTE: BACKUP_REMOTE not set — local-only backup (does not survive disk loss)"
fi

# Rotation: delete dumps older than KEEP_DAILY days, but keep Sunday dumps up to
# KEEP_WEEKLY days.
now="$(date +%s)"
for f in "$BACKUP_DIR"/hbs_*.dump; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"            # hbs_YYYYMMDD_HHMMSS.dump
  d="${base:4:8}"                    # YYYYMMDD
  ts="$(date -d "$d" +%s 2>/dev/null || echo 0)"
  [ "$ts" = "0" ] && continue
  age_days=$(( (now - ts) / 86400 ))
  dow="$(date -d "$d" +%u 2>/dev/null || echo 0)"  # 7 = Sunday
  if [ "$age_days" -le "$KEEP_DAILY" ]; then
    continue
  fi
  if [ "$dow" = "7" ] && [ "$age_days" -le "$KEEP_WEEKLY" ]; then
    continue
  fi
  echo "$(date '+%F %T') pruning old backup $base (${age_days}d)"
  rm -f "$f"
done

echo "$(date '+%F %T') done. retained: $(ls -1 "$BACKUP_DIR"/hbs_*.dump 2>/dev/null | wc -l) dumps"

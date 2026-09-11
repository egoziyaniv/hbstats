#!/bin/bash
# install-crontab.sh — install ops/crontab as the hbs user's crontab.
#
# The live crontab is not in git and does not survive a server rebuild, so ops/crontab is
# the source of truth: edit it, commit, pull on the server, run this.
#
# Always backs the current crontab up first, and shows a diff before replacing it.
#
#   scripts/install-crontab.sh            # show the diff, then ask
#   scripts/install-crontab.sh --force    # install without asking (for automation)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_DIR/ops/crontab"
BACKUP_DIR="$HOME/crontab-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
crontab -l > "$BACKUP_DIR/crontab.$STAMP" 2>/dev/null || : > "$BACKUP_DIR/crontab.$STAMP"
echo "current crontab backed up to $BACKUP_DIR/crontab.$STAMP"

# Compare only the schedule lines — comments and ordering are presentation.
entries() { grep -E '^[0-9*]' "$1" | sort; }
if diff -q <(entries "$BACKUP_DIR/crontab.$STAMP") <(entries "$SRC") > /dev/null 2>&1; then
  echo "already up to date — nothing to install"
  exit 0
fi

echo
echo "--- changes (live -> repo) ---"
diff <(entries "$BACKUP_DIR/crontab.$STAMP") <(entries "$SRC") || true
echo

if [ "${1:-}" != "--force" ]; then
  read -r -p "install ops/crontab? [y/N] " reply
  case "$reply" in [yY]*) ;; *) echo "aborted"; exit 1 ;; esac
fi

crontab "$SRC"
echo "installed. live entries now:"
crontab -l | grep -cE '^[0-9*]'

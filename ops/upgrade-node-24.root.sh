#!/bin/bash
# upgrade-node-24.root.sh — the root half of moving production from Node 20 to Node 24.
#
# Why: CVE-2026-111497, an RCE in the Brotli decoder bundled with Node. It is reachable
# whenever Node decompresses attacker-controlled Brotli, and fetch() does that to any
# response automatically — our crons fetch from ~15 external sites. Fixed in 24.22.1;
# Node 20 is end-of-life (2026-04-30) and gets no fix.
#
# Run as root (or with sudo) on the server:
#     sudo bash /home/hbs/hbstats/ops/upgrade-node-24.root.sh
#
# It does three things, each verified, each reverted if it fails:
#   1. NodeSource repo node_20.x -> node_24.x, install, require >= 24.22.1
#   2. nginx: reject requests with Content-Encoding: br (the inbound attack path)
#   3. nothing else — the app rebuild + pm2 restart is the hbs half (see docs/OPERATIONS.md)
#
# The site keeps running on the old process throughout; nothing restarts here.
set -euo pipefail

SRC=/etc/apt/sources.list.d/nodesource.sources
SITE=/etc/nginx/sites-available/hbstats
SNIP=/etc/nginx/snippets/reject-brotli-body.conf
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
MIN=24.22.1

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

ver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

echo "== 1/2 Node: $(node -v 2>/dev/null || echo none) -> 24.x"
cp "$SRC" "$SRC.bak-$STAMP"
sed -i 's#deb.nodesource.com/node_20.x#deb.nodesource.com/node_24.x#' "$SRC"
if ! { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs; }; then
  echo "!! apt failed — restoring node_20.x source"; cp "$SRC.bak-$STAMP" "$SRC"; apt-get update -qq || true; exit 1
fi
NEW=$(node -v | sed 's/^v//')
if ! ver_ge "$NEW" "$MIN"; then
  echo "!! got Node $NEW, need >= $MIN — restoring node_20.x"
  cp "$SRC.bak-$STAMP" "$SRC"; apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --allow-downgrades nodejs=20.20.2-1nodesource1
  exit 1
fi
echo "   ok: Node $NEW ($(which node)); pm2 $(pm2 -v 2>/dev/null)"

echo "== 2/2 nginx: reject Content-Encoding: br request bodies"
mkdir -p /etc/nginx/snippets
cat > "$SNIP" << 'NGX'
# CVE-2026-111497: never let a Brotli-encoded request body reach Node's decoder.
if ($http_content_encoding ~* "br") { return 415; }
NGX
if ! grep -q "reject-brotli-body.conf" "$SITE"; then
  cp "$SITE" "$SITE.bak-$STAMP"
  # Into every server block that proxies to the app (the 443 one; the :80 one only redirects
  # but a harmless include there is fine too) — right after its server_name line.
  sed -i '/^\s*server_name /a\    include snippets/reject-brotli-body.conf;' "$SITE"
  if ! nginx -t 2>&1; then
    echo "!! nginx -t failed — restoring site config"; cp "$SITE.bak-$STAMP" "$SITE"; exit 1
  fi
  systemctl reload nginx
fi
echo "   ok: $(grep -c 'reject-brotli-body.conf' "$SITE") server block(s) protected"

echo
echo "Root part done. Now the hbs part (rebuild on Node 24 + pm2 restart onto it)."
echo "Rollback of Node, if ever needed:"
echo "  cp $SRC.bak-$STAMP $SRC && apt-get update && apt-get install --allow-downgrades nodejs=20.20.2-1nodesource1"

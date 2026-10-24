#!/bin/bash
# upgrade-node-24.app.sh — the hbs half: rebuild the app on the new Node and move pm2 onto it.
# Run as hbs AFTER ops/upgrade-node-24.root.sh:   bash ~/hbstats/ops/upgrade-node-24.app.sh
#
# pm2's daemon was started under Node 20 and keeps running it until it is restarted, so
# without `pm2 update` the site would stay on the vulnerable runtime even after apt.
set -euo pipefail
cd /home/hbs/hbstats
MIN=24.22.1
ver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

NODE=$(node -v | sed 's/^v//')
ver_ge "$NODE" "$MIN" || { echo "Node is $NODE — run the root half first"; exit 1; }
echo "== Node $NODE"

# Keep the working build: if the Node 24 build fails, put it back and the site is untouched.
rm -rf .next.pre-node24 && cp -a .next .next.pre-node24

npm ci --no-audit --no-fund
npx prisma generate >/dev/null
if ! npm run build; then
  echo "!! build failed on Node $NODE — restoring the previous build"
  rm -rf .next && mv .next.pre-node24 .next
  exit 1
fi

pm2 update            # restart the pm2 daemon (and the app) under the new Node
sleep 5
RUNNING=$(pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name==="hbstats");console.log(p?p.pm2_env.node_version:"missing")})')
echo "== pm2 hbstats now on Node $RUNNING"
ver_ge "$RUNNING" "$MIN" || { echo "!! pm2 still on $RUNNING"; exit 1; }

for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/ || true)
  [ "$code" = 200 ] && break; sleep 2
done
echo "== local health: HTTP $code"
[ "$code" = 200 ] || exit 1
rm -rf .next.pre-node24
echo "done"

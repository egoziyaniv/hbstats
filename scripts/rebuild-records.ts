/**
 * rebuild-records.ts — materializes the RecordEntry table ("ספר השיאים") from
 * league games + goal events. Run after any merge that touches games/events,
 * and nightly via cron (see the plan's release task for the crontab line).
 *
 * Self-loads .env (same pattern as scripts/notify-matches.js) since this is
 * executed directly via tsx, not through Next's env loading.
 *
 *   npx tsx scripts/rebuild-records.ts
 */
import fs from 'fs';
import path from 'path';

(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
})();

// Relative import — tsx does not resolve the tsconfig `@/*` path alias.
import { rebuildAllRecords } from '../src/lib/history/records-engine';

async function main() {
  const startedAt = Date.now();
  const { written, byCategory } = await rebuildAllRecords();
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`[rebuild-records] wrote ${written} record row(s) in ${seconds}s`);
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`  ${category}: ${count}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[rebuild-records] failed:', err);
    process.exit(1);
  });

/**
 * prewarm-stat-narratives.ts — warms the StatNarrative cache for every
 * registered stat-answer question, so the first user to open a card after
 * a nightly rebuild doesn't pay the AI-generation latency.
 *
 * Self-loads .env (same pattern as scripts/rebuild-records.ts) since this is
 * executed directly via tsx, not through Next's env loading.
 *
 *   npx tsx scripts/prewarm-stat-narratives.ts
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
import { answerQuestion, REGISTRY } from '../src/lib/stats-qa';

const HBS_CLUB_KEY = 'api-563';

async function main() {
  const startedAt = Date.now();
  let processed = 0;

  for (const q of REGISTRY) {
    if (q.needsRival) continue; // requires a rival club; warms on demand via club_h2h_rival.

    if (q.scope === 'league') {
      await answerQuestion(q.id, {});
    } else {
      await answerQuestion(q.id, { clubKey: HBS_CLUB_KEY });
    }
    processed++;
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[prewarm-stat-narratives] processed ${processed} questions in ${seconds}s`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[prewarm-stat-narratives] failed:', err);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Import one Flashscore match by URL.
 *
 * Use when Flashscore's tournament page doesn't render the match list (e.g.
 * older single-match competitions like super-cup-2015) so the regular
 * fixtures→matches scraper finds nothing. The user opens the match in a
 * browser, copies the URL, we extract the keys, upsert a row, and scrape it.
 *
 * Usage:
 *   node scripts/import-flashscore-single-match.js \
 *     --url https://www.flashscore.com/match/football/maccabi-tel-aviv-req5XE5Q/kiryat-shmona-QN0gwBSC/ \
 *     --league-slug super-cup-2015 \
 *     --season 2015-2016
 *
 * Optional:
 *   --mid <matchKey>    Override the auto-detected match key (if URL lacks one).
 */

const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');
const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

(async () => {
  const url = arg('url');
  const leagueSlug = arg('league-slug');
  const season = arg('season');
  const explicitMid = arg('mid', null);

  if (!url || !leagueSlug || !season) {
    console.error('Usage: --url <flashscore-match-url> --league-slug <slug> --season <YYYY-YYYY>');
    process.exit(1);
  }

  // Parse the URL — Flashscore match URLs look like:
  //   https://www.flashscore.com/match/football/<home-name>-<homeKey>/<away-name>-<awayKey>/?mid=<matchKey>#tab
  // The match key may live in the ?mid= param OR in the last path segment of
  // a #/.../<key> fragment, depending on which page Flashscore generated.
  const m = url.match(/\/match\/football\/([^/]+)\/([^/?#]+)\/?/);
  if (!m) {
    console.error('Could not parse home/away keys from URL');
    process.exit(1);
  }
  const homeRaw = m[1];
  const awayRaw = m[2];
  // Team keys are the trailing 6+ alphanumeric characters of each name slug.
  const homeKeyMatch = homeRaw.match(/-([A-Za-z0-9]{6,})$/);
  const awayKeyMatch = awayRaw.match(/-([A-Za-z0-9]{6,})$/);
  const homeKey = homeKeyMatch ? `${homeRaw.replace(/-[A-Za-z0-9]{6,}$/, '')}-${homeKeyMatch[1]}` : homeRaw;
  const awayKey = awayKeyMatch ? `${awayRaw.replace(/-[A-Za-z0-9]{6,}$/, '')}-${awayKeyMatch[1]}` : awayRaw;
  // Match key — prefer explicit, then ?mid=, then last path segment heuristic.
  let matchKey = explicitMid;
  if (!matchKey) {
    const mid = url.match(/[?&]mid=([A-Za-z0-9]{6,})/);
    matchKey = mid ? mid[1] : null;
  }
  if (!matchKey) {
    console.error('No match key found in URL. Add ?mid=<key> or pass --mid.');
    process.exit(1);
  }

  console.log(`Match key: ${matchKey}`);
  console.log(`Home: ${homeKey}`);
  console.log(`Away: ${awayKey}`);
  console.log(`League: ${leagueSlug} / Season: ${season}`);

  // 1. Upsert the scraped-match row so the existing match scraper can find it.
  await prisma.flashscoreScrapedMatch.upsert({
    where: { matchKey },
    create: {
      matchKey,
      url,
      leagueSlug,
      season,
      homeKey,
      awayKey,
      payload: {},
    },
    update: {
      url,
      leagueSlug,
      season,
      homeKey,
      awayKey,
    },
  });
  console.log('✓ Upserted into flashscore_scraped_match');

  // 2. Hand off to the existing match scraper for the actual page detail
  //    fetch — it handles cookie consent, retries, and stats parsing.
  console.log('\n→ Running scrape-flashscore-match for this key...');
  const r = spawnSync('node', ['scripts/scrape-flashscore-match.js', '--match', matchKey], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (r.status !== 0) {
    console.error('Match scraper failed');
    process.exit(r.status || 1);
  }

  // 3. Run enrichment so the data flows into the main DB.
  console.log('\n→ Running Flashscore enrichment merge...');
  const m2 = spawnSync('node', ['scripts/rebuild/44-flashscore-enrichment.js', '--apply'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (m2.status !== 0) {
    console.error('Enrichment failed');
    process.exit(m2.status || 1);
  }

  await prisma.$disconnect();
  console.log('\n✓ Single match import complete.');
})();

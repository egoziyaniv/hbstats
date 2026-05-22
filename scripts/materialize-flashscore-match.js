#!/usr/bin/env node
/**
 * Materialize a scraped Flashscore match into the main DB.
 *
 * Given a matchKey (already in flashscore_scraped_match), this script:
 *  1. Reads the scraped payload (title, scoreInfo, datetime).
 *  2. Looks up the home/away teams in the main DB for the requested season.
 *     If a team is missing for that season, finds the team in any other
 *     season by name and creates a new season-specific record using the
 *     latest known nameHe/nameEn/logoUrl/apiFootballId. We do NOT carry
 *     over a roster — old seasons have different players.
 *  3. Resolves the competition by slug heuristic (super-cup-* → super-cup
 *     etc.).
 *  4. Creates (or updates) the Game row with the right score, date, and
 *     COMPLETED status.
 *
 * Events stay in the scraped payload for now — they lack reliable
 * player/team IDs in the Flashscore feed; future work to NLP-link them.
 *
 * Usage:
 *   node scripts/materialize-flashscore-match.js --match <matchKey>
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

// "super-cup-2015" → "comp_super_cup", "ligat-ha-al-2018-2019" → "comp_liga_haal", etc.
function competitionIdFromSlug(slug) {
  const base = slug.replace(/-(19|20)\d{2}(-(19|20)\d{2})?$/, '');
  switch (base) {
    case 'ligat-ha-al': return 'comp_liga_haal';
    case 'leumit-league': return 'comp_liga_leumit';
    case 'state-cup': return 'comp_state_cup';
    case 'super-cup': return 'comp_super_cup';
    case 'toto-cup': return 'comp_toto_cup_al';
    default: return null;
  }
}

function startYearFromSeason(season) {
  const m = season.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

// Parse "MAC 2-3 KIR | Maccabi Tel Aviv v Kiryat Shmona 15/08/2015 | ..." →
// { homeNameEn, awayNameEn }.
function parseTitle(title) {
  if (!title) return null;
  // Strip leading score abbreviation, take the middle segment.
  const parts = title.split('|').map((s) => s.trim());
  for (const seg of parts) {
    const m = seg.match(/^(.+?)\s+v\s+(.+?)\s+\d{2}\/\d{2}\/\d{4}/);
    if (m) return { homeNameEn: m[1].trim(), awayNameEn: m[2].trim() };
  }
  return null;
}

// "2 - 3 ( 1 - 1 ) AFTER PENALTIES" → { homeFull: 2, awayFull: 3, homeReg: 1, awayReg: 1, penalties: true }
function parseScoreInfo(scoreInfo) {
  if (!scoreInfo) return null;
  const m = scoreInfo.match(/(\d+)\s*-\s*(\d+)\s*(?:\(\s*(\d+)\s*-\s*(\d+)\s*\))?/);
  if (!m) return null;
  return {
    homeFull: parseInt(m[1], 10),
    awayFull: parseInt(m[2], 10),
    homeReg: m[3] != null ? parseInt(m[3], 10) : parseInt(m[1], 10),
    awayReg: m[4] != null ? parseInt(m[4], 10) : parseInt(m[2], 10),
    penalties: /PENALTIES/i.test(scoreInfo),
  };
}

// "15.08.2015 17:50" → Date
function parseDateTime(s) {
  if (!s) return null;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  // Israel local time; store as UTC by shifting -3 (rough — DST varies but fine for old fixtures).
  const local = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`);
  return local;
}

// For a team identified by english name + Hebrew (if any), find or create a
// Team row scoped to the season. We never copy a roster — only identity.
async function findOrCreateTeamForSeason(seasonId, nameEn, hintsHe) {
  // 1. Exact match in this season by nameEn (most reliable).
  let team = await prisma.team.findFirst({
    where: { seasonId, nameEn: { equals: nameEn, mode: 'insensitive' } },
  });
  if (team) return team;
  // 2. Match by Hebrew hint, e.g. "Kiryat Shmona" → "עירוני קריית שמונה".
  if (hintsHe) {
    team = await prisma.team.findFirst({
      where: { seasonId, nameHe: { contains: hintsHe } },
    });
    if (team) return team;
  }
  // 3. Find a record from a different season to copy identity fields.
  const template = await prisma.team.findFirst({
    where: {
      OR: [
        { nameEn: { equals: nameEn, mode: 'insensitive' } },
        hintsHe ? { nameHe: { contains: hintsHe } } : { id: '__never__' },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!template) {
    throw new Error(`No template Team record found for "${nameEn}" — create one manually first.`);
  }
  // 4. Create a new season-scoped record using the template's identity fields.
  const created = await prisma.team.create({
    data: {
      seasonId,
      nameEn: template.nameEn,
      nameHe: template.nameHe,
      logoUrl: template.logoUrl,
      apiFootballId: template.apiFootballId,
      shortName: template.shortName,
      foundedYear: template.foundedYear,
      websiteUrl: template.websiteUrl,
      // Roster intentionally NOT copied — old seasons had different players.
    },
  });
  console.log(`  + Created Team for season ${seasonId}: ${created.nameHe} (template id ${template.id})`);
  return created;
}

async function materializeOne(scraped) {
  const payload = scraped.payload || {};
  const competitionId = competitionIdFromSlug(scraped.leagueSlug);
  if (!competitionId) {
    return { ok: false, reason: `unknown competition for slug "${scraped.leagueSlug}"` };
  }
  const startYear = startYearFromSeason(scraped.season);
  if (!startYear) return { ok: false, reason: `bad season string "${scraped.season}"` };
  const season = await prisma.season.findFirst({ where: { year: startYear } });
  if (!season) return { ok: false, reason: `season for year ${startYear} not found` };

  const titleInfo = parseTitle(payload.title);
  if (!titleInfo) return { ok: false, reason: 'no title' };
  const score = parseScoreInfo(payload.scoreInfo);
  const dt = parseDateTime(payload.datetime);

  const heHints = {
    'maccabi tel aviv': 'מכבי תל אביב', 'kiryat shmona': 'קריית שמונה', 'shmona': 'קריית שמונה',
    'hapoel beer sheva': 'הפועל באר שבע', 'beer sheva': 'הפועל באר שבע',
    'hapoel tel aviv': 'הפועל תל אביב', 'maccabi haifa': 'מכבי חיפה',
    'maccabi netanya': 'מכבי נתניה', 'beitar jerusalem': 'בית"ר ירושלים',
    'hapoel jerusalem': 'הפועל ירושלים', 'hapoel haifa': 'הפועל חיפה',
    'maccabi petah tikva': 'מכבי פתח תקווה', 'hapoel petah tikva': 'הפועל פתח תקווה',
    'bnei sakhnin': 'בני סכנין', 'ironi kiryat shmona': 'קריית שמונה',
    'maccabi bnei raina': 'מכבי בני ריינה', 'ironi tiberias': 'עירוני טבריה',
    'ashdod': 'מ.ס. אשדוד', 'hapoel katamon': 'הפועל קטמון',
  };
  const homeHint = heHints[titleInfo.homeNameEn.toLowerCase()] || null;
  const awayHint = heHints[titleInfo.awayNameEn.toLowerCase()] || null;

  let homeTeam, awayTeam;
  try {
    homeTeam = await findOrCreateTeamForSeason(season.id, titleInfo.homeNameEn, homeHint);
    awayTeam = await findOrCreateTeamForSeason(season.id, titleInfo.awayNameEn, awayHint);
  } catch (e) {
    return { ok: false, reason: e.message };
  }

  const existing = await prisma.game.findFirst({
    where: { seasonId: season.id, competitionId, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id },
  });

  const gameData = {
    seasonId: season.id,
    competitionId,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore: score ? score.homeReg : null,
    awayScore: score ? score.awayReg : null,
    dateTime: dt || new Date(`${season.year}-08-15`),
    status: 'COMPLETED',
    roundNameHe: null,
    roundNameEn: null,
    additionalInfo: score && score.penalties
      ? { penaltyShootout: { homeScore: score.homeFull - score.homeReg, awayScore: score.awayFull - score.awayReg } }
      : undefined,
  };

  if (existing) {
    await prisma.game.update({ where: { id: existing.id }, data: gameData });
    return { ok: true, action: 'updated', gameId: existing.id, home: titleInfo.homeNameEn, away: titleInfo.awayNameEn };
  }
  const created = await prisma.game.create({ data: gameData });
  return { ok: true, action: 'created', gameId: created.id, home: titleInfo.homeNameEn, away: titleInfo.awayNameEn };
}

(async () => {
  const matchKey = arg('match');
  const leagueSlug = arg('league-slug');
  const seasonArg = arg('season');

  // Batch mode — process every scraped match for a given league+season.
  if (!matchKey && leagueSlug && seasonArg) {
    const rows = await prisma.flashscoreScrapedMatch.findMany({
      where: { leagueSlug, season: seasonArg },
      orderBy: { kickoffAt: 'asc' },
    });
    console.log(`Materialize batch: ${rows.length} scraped matches for ${leagueSlug} / ${seasonArg}`);
    let created = 0, updated = 0, skipped = 0;
    for (const r of rows) {
      const res = await materializeOne(r);
      if (!res.ok) {
        skipped++;
        if (skipped <= 3) console.log(`  - ${r.matchKey}: ${res.reason}`);
        continue;
      }
      if (res.action === 'created') created++;
      else updated++;
    }
    console.log(`  Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
    await prisma.$disconnect();
    return;
  }

  if (!matchKey) {
    console.error('Usage: --match <matchKey>  OR  --league-slug <slug> --season <YYYY-YYYY>');
    process.exit(1);
  }

  const scraped = await prisma.flashscoreScrapedMatch.findUnique({ where: { matchKey } });
  if (!scraped) {
    console.error('Match not found in flashscore_scraped_match');
    process.exit(1);
  }
  const payload = scraped.payload || {};

  const competitionId = competitionIdFromSlug(scraped.leagueSlug);
  if (!competitionId) {
    console.error(`Unknown competition for slug "${scraped.leagueSlug}"`);
    process.exit(1);
  }
  const startYear = startYearFromSeason(scraped.season);
  if (!startYear) {
    console.error(`Bad season string "${scraped.season}"`);
    process.exit(1);
  }
  const season = await prisma.season.findFirst({ where: { year: startYear } });
  if (!season) {
    console.error(`Season for year ${startYear} not found`);
    process.exit(1);
  }

  const titleInfo = parseTitle(payload.title);
  if (!titleInfo) {
    console.error('Could not parse team names from payload.title');
    process.exit(1);
  }
  const score = parseScoreInfo(payload.scoreInfo);
  const dt = parseDateTime(payload.datetime);

  console.log(`Match: ${titleInfo.homeNameEn} vs ${titleInfo.awayNameEn}`);
  console.log(`Competition: ${competitionId}, Season: ${season.year}`);
  if (score) console.log(`Score: ${score.homeFull}-${score.awayFull}${score.penalties ? ' (pen)' : ''}, regular ${score.homeReg}-${score.awayReg}`);
  if (dt) console.log(`Kickoff: ${dt.toISOString()}`);

  // Hebrew hints from common Hebrew naming for Israeli teams. Used only when
  // we don't already have an English-name match.
  const heHints = {
    'maccabi tel aviv': 'מכבי תל אביב',
    'kiryat shmona': 'קריית שמונה',
    'shmona': 'קריית שמונה',
    'hapoel beer sheva': 'הפועל באר שבע',
    'beer sheva': 'הפועל באר שבע',
    'hapoel tel aviv': 'הפועל תל אביב',
    'maccabi haifa': 'מכבי חיפה',
    'maccabi netanya': 'מכבי נתניה',
    'beitar jerusalem': 'בית"ר ירושלים',
    'hapoel jerusalem': 'הפועל ירושלים',
  };
  const homeHint = heHints[titleInfo.homeNameEn.toLowerCase()] || null;
  const awayHint = heHints[titleInfo.awayNameEn.toLowerCase()] || null;

  const homeTeam = await findOrCreateTeamForSeason(season.id, titleInfo.homeNameEn, homeHint);
  const awayTeam = await findOrCreateTeamForSeason(season.id, titleInfo.awayNameEn, awayHint);

  // Upsert the Game row.
  const existing = await prisma.game.findFirst({
    where: {
      seasonId: season.id,
      competitionId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
    },
  });

  const gameData = {
    seasonId: season.id,
    competitionId,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    // Store the regular-time score in homeScore/awayScore; the penalty result
    // (when relevant) lives in additionalInfo so we don't lose it.
    homeScore: score ? score.homeReg : null,
    awayScore: score ? score.awayReg : null,
    dateTime: dt || new Date(`${season.year}-08-15`),
    status: /** @type {'COMPLETED'} */ ('COMPLETED'),
    roundNameHe: 'גמר',
    roundNameEn: 'Final',
    additionalInfo: score && score.penalties
      ? { penaltyShootout: { homeScore: score.homeFull - score.homeReg, awayScore: score.awayFull - score.awayReg } }
      : undefined,
  };

  let game;
  if (existing) {
    game = await prisma.game.update({ where: { id: existing.id }, data: gameData });
    console.log(`  ~ Updated Game ${game.id}`);
  } else {
    game = await prisma.game.create({ data: gameData });
    console.log(`  + Created Game ${game.id}`);
  }

  await prisma.$disconnect();
  console.log('\n✓ Materialize complete.');
})();

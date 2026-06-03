/**
 * scrape-sofascore-coaches.js — pull current head-coach name + photo from
 * each Ligat HaAl team's Sofascore page (Firecrawl, 1 credit per team).
 *
 * Saves the Sofascore photo URL to Coach.photoUrl. By default ONLY overwrites
 * rows where photoUrl is null OR points to api-sports.io (the API-Football CDN
 * that often returns 404 for Israeli coaches). Pass --force to overwrite all.
 *
 * Matching: looks up Coach via CoachAlias on the scraped manager name. If no
 * alias exists, the script logs and skips — alias creation is left to the
 * existing manual /admin/coaches flow so we don't pollute the table.
 *
 * Usage:
 *   node scripts/scrape-sofascore-coaches.js [--limit N] [--force]
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('limit', '0'), 10);
const FORCE = process.argv.includes('--force');
const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) { console.error('Missing FIRECRAWL_API_KEY'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firecrawl(url, attempt = 1) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], waitFor: 5000, onlyMainContent: false }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch {
      if (attempt < 2) { await sleep(2000); return firecrawl(url, attempt + 1); }
      return null;
    }
    if (!data?.success) return null;
    return data.data;
  } catch {
    if (attempt < 2) { await sleep(2000); return firecrawl(url, attempt + 1); }
    return null;
  }
}

async function firecrawlSearch(query) {
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 5 }),
  });
  const text = await res.text();
  try { return JSON.parse(text)?.data || []; } catch { return []; }
}

async function findTeamUrl(teamNameEn) {
  const results = await firecrawlSearch(`site:sofascore.com football/team ${teamNameEn}`);
  for (const r of results) {
    if (!r.url) continue;
    const m = r.url.match(/sofascore\.com\/football\/team\/([a-z0-9-]+)\/(\d+)\b/);
    if (!m) continue;
    if (m[1].match(/u\d+|junior|youth|reserve/i)) continue;
    return r.url;
  }
  return null;
}

function normalize(s) {
  return (s || '').replace(/[.,'"`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseManager(md) {
  // Sofascore renders the head coach as a markdown link whose label often
  // wraps an inline image. Pattern: `[![alt](photo-url)<NAME>](profile-url)`
  // — capture all three pieces in one shot, then fall back to plain-text
  // links when the image isn't present. We try /football/manager/ and
  // /football/coach/ + the un-namespaced versions because the slug has
  // shifted between Sofascore deploys.
  const compoundPatterns = [
    /\[!\[[^\]]*\]\(([^)]+)\)([^\]]+)\]\(([^)]*\/football\/(?:manager|coach)\/[^)]+)\)/i,
    /\[!\[[^\]]*\]\(([^)]+)\)([^\]]+)\]\(([^)]*\/(?:manager|coach)\/[^)]+)\)/i,
  ];
  let compound = null;
  for (const p of compoundPatterns) {
    const m = md.match(p);
    if (m) { compound = m; break; }
  }
  let photoUrl = null;
  let name = null;
  let profileUrl = null;
  if (compound) {
    photoUrl = compound[1];
    name = compound[2].trim();
    profileUrl = compound[3];
  } else {
    // Plain text link without an image wrapper.
    const linkPatterns = [
      /\[([^\]\n!]+)\]\(([^)]*\/football\/(?:manager|coach)\/[^)]+)\)/i,
      /\[([^\]\n!]+)\]\(([^)]*\/(?:manager|coach)\/[^)]+)\)/i,
    ];
    for (const p of linkPatterns) {
      const m = md.match(p);
      if (m) {
        name = m[1].trim();
        profileUrl = m[2];
        break;
      }
    }
    const imgMatch = md.match(/!\[[^\]]*\]\((https?:\/\/[^)]*(?:manager|coach)\/\d+\/image[^)]*)\)/i);
    if (imgMatch) photoUrl = imgMatch[1];
  }

  if (!photoUrl && profileUrl) {
    const idMatch = profileUrl.match(/\/(?:manager|coach)\/[^\/]+\/(\d+)/);
    if (idMatch) photoUrl = `https://img.sofascore.com/api/v1/manager/${idMatch[1]}/image`;
  }
  if (name) name = name.replace(/^(manager|coach|head\s*coach)\s*[:\-]?\s*/i, '').trim();
  if (name && name.length < 3) name = null;

  // Debug: when we miss, expose the slice of markdown around the literal
  // word "manager"/"coach" so we can see what Firecrawl actually returned.
  if (!name) {
    const idx = md.search(/manager|head\s*coach|\bcoach\b/i);
    if (idx >= 0) {
      const slice = md.slice(Math.max(0, idx - 80), Math.min(md.length, idx + 280));
      console.log('  · markdown slice around coach keyword:');
      console.log('    ' + slice.replace(/\n/g, '\n    '));
    } else {
      console.log('  · no "manager"/"coach" keyword found in markdown');
    }
  }
  return { name, profileUrl, photoUrl };
}

async function findCoachByName(name) {
  if (!name) return null;
  const norm = normalize(name);
  // Exact (case-insensitive) match on nameEn first, then via aliases.
  const direct = await prisma.coach.findFirst({
    where: { OR: [{ nameEn: { equals: name, mode: 'insensitive' } }, { nameHe: { equals: name, mode: 'insensitive' } }] },
    select: { id: true, nameEn: true, photoUrl: true },
  });
  if (direct) return direct;
  const alias = await prisma.coachAlias.findFirst({
    where: { alias: { equals: name, mode: 'insensitive' } },
    select: { coach: { select: { id: true, nameEn: true, photoUrl: true } } },
  });
  if (alias?.coach) return alias.coach;
  // Last resort: match by normalized last token against nameEn (handles e.g.
  // Sofascore "Jorge Pereira" vs our "Jorge Pereira Júnior").
  const tokens = norm.split(' ');
  const last = tokens[tokens.length - 1];
  if (last && last.length >= 4) {
    const fuzzy = await prisma.coach.findFirst({
      where: { nameEn: { contains: last, mode: 'insensitive' } },
      select: { id: true, nameEn: true, photoUrl: true },
    });
    if (fuzzy) return fuzzy;
  }
  return null;
}

function shouldOverwrite(coach) {
  if (FORCE) return true;
  if (!coach.photoUrl) return true;
  // API-Football's CDN often returns 404 / placeholder for Israeli coaches.
  // Treat any api-sports.io URL as "missing" and overwrite with Sofascore.
  if (coach.photoUrl.includes('api-sports.io')) return true;
  return false;
}

async function processTeam(team) {
  console.log(`\n• ${team.nameHe || team.nameEn}`);
  const teamUrl = await findTeamUrl(team.nameEn);
  if (!teamUrl) { console.log('  ✗ no Sofascore URL'); return null; }
  console.log(`  → ${teamUrl}`);

  const data = await firecrawl(teamUrl);
  if (!data?.markdown) { console.log('  ✗ no markdown'); return null; }

  const manager = parseManager(data.markdown);
  if (!manager.name) { console.log('  ✗ no manager parsed'); return null; }
  console.log(`  parsed: ${manager.name}${manager.photoUrl ? ' + photo' : ' (no photo)'}`);

  const coach = await findCoachByName(manager.name);
  if (!coach) {
    console.log(`  ✗ no matching Coach in DB for "${manager.name}" — skipping`);
    return { team: team.nameEn, manager: manager.name, matched: false };
  }
  if (!manager.photoUrl) {
    console.log(`  · ${coach.nameEn}: name matched but no photo URL — skipping`);
    return { team: team.nameEn, coachId: coach.id, matched: true, saved: false };
  }
  if (!shouldOverwrite(coach)) {
    console.log(`  · ${coach.nameEn}: already has photoUrl, skipping (use --force to overwrite)`);
    return { team: team.nameEn, coachId: coach.id, matched: true, saved: false };
  }

  await prisma.coach.update({ where: { id: coach.id }, data: { photoUrl: manager.photoUrl } });
  console.log(`  ✓ ${coach.nameEn}: photoUrl updated`);
  return { team: team.nameEn, coachId: coach.id, matched: true, saved: true };
}

async function main() {
  const teams = await prisma.team.findMany({
    where: { season: { year: 2025 }, standings: { some: { competitionId: 'comp_liga_haal' } } },
    select: { id: true, nameHe: true, nameEn: true },
  });
  console.log(`Found ${teams.length} Ligat HaAl teams for 2025/26.`);
  let processed = 0, saved = 0, matched = 0;
  for (const t of teams) {
    if (LIMIT && processed >= LIMIT) break;
    const res = await processTeam(t);
    if (res?.matched) matched++;
    if (res?.saved) saved++;
    processed++;
    await sleep(400);
  }
  console.log(`\nDONE — teams: ${processed}, matched coaches: ${matched}, photos updated: ${saved}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });

#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const israelDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const isHbs = (team) => team?.nameHe === 'הפועל באר שבע';
function captureDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 19) === value ? value.slice(0, 10) : null;
}

function planImport(photos, fixtures) {
  const ready = [], skipped = [], hashes = new Set();
  for (const photo of photos) {
    let reason;
    const day = captureDay(photo.captureLocal);
    if (photo.reviewed !== true) reason = 'not-reviewed';
    else if (photo.dateEvidence !== 'exif-original' || !day) reason = 'unverified-capture-date';
    else if (!/^[a-f0-9]{64}$/.test(photo.sha256 || '')) reason = 'missing-content-hash';
    else if (hashes.has(photo.sha256)) reason = 'duplicate-content';
    const matches = reason ? [] : fixtures.filter((game) =>
      (isHbs(game.homeTeam) || isHbs(game.awayTeam)) && israelDay.format(new Date(game.dateTime)) === day);
    if (!reason && matches.length !== 1) reason = matches.length ? 'ambiguous-fixture' : 'no-fixture';
    if (reason) { skipped.push({ sourceId: photo.sourceId, reason }); continue; }
    hashes.add(photo.sha256);
    ready.push({ ...photo, id: `drive-photo-${photo.sha256}`, gameId: matches[0].id, fixture: matches[0] });
  }
  return { ready, skipped };
}

function verifyFile(photo, publicRoot) {
  if (!/^\/uploads\/games\/drive-photos\/[a-zA-Z0-9_-]+\.jpg$/.test(photo.filePath || '')) throw new Error('Invalid photo path');
  const allowed = fs.realpathSync(path.join(publicRoot, 'uploads/games/drive-photos'));
  const target = fs.realpathSync(path.join(publicRoot, photo.filePath.slice(1)));
  if (path.dirname(target) !== allowed) throw new Error('Photo path escapes upload directory');
  const data = fs.readFileSync(target);
  if (data.length !== photo.sizeBytes) throw new Error(`Photo size mismatch: ${photo.sourceId}`);
  if (createHash('sha256').update(data).digest('hex') !== photo.sha256) throw new Error(`Photo hash mismatch: ${photo.sourceId}`);
}

async function applyImport(tx, photos) {
  let created = 0, existing = 0;
  for (const photo of photos) {
    const previous = await tx.mediaAsset.findUnique({ where: { id: photo.id } });
    if (previous) {
      if (previous.gameId !== photo.gameId || previous.filePath !== photo.filePath) throw new Error(`Existing asset conflicts: ${photo.id}`);
      existing++; continue;
    }
    const last = await tx.mediaAsset.aggregate({ where: { gameId: photo.gameId }, _max: { displayOrder: true } });
    await tx.mediaAsset.create({ data: {
      id: photo.id, kind: 'GAME_PHOTO', gameId: photo.gameId,
      title: photo.title, originalName: photo.originalName,
      filePath: photo.filePath, mimeType: 'image/jpeg', sizeBytes: photo.sizeBytes,
      displayOrder: (last._max.displayOrder ?? -1) + 1, isPrimary: false,
    } });
    created++;
  }
  return { created, existing };
}

function summarizeAssignment(photo) {
  return { sourceId: photo.sourceId, captureLocal: photo.captureLocal, gameId: photo.gameId,
    fixtureDateTime: photo.fixture.dateTime, homeTeam: photo.fixture.homeTeam.nameHe, awayTeam: photo.fixture.awayTeam.nameHe };
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const value = (flag) => { const i = process.argv.indexOf(flag); return i === -1 ? null : process.argv[i + 1]; };
  const manifest = JSON.parse(fs.readFileSync(value('--manifest') || path.join(root, 'data/drive-photos/manifest.json'), 'utf8'));
  const publicRoot = path.resolve(value('--public-root') || path.join(root, 'public'));
  require('@next/env').loadEnvConfig(root);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const fixtures = await prisma.game.findMany({
      where: { OR: [{ homeTeam: { nameHe: 'הפועל באר שבע' } }, { awayTeam: { nameHe: 'הפועל באר שבע' } }] },
      select: { id: true, dateTime: true, homeTeam: { select: { nameHe: true } }, awayTeam: { select: { nameHe: true } } },
    });
    const plan = planImport(manifest.photos, fixtures);
    // Validate the entire batch before the first database write.
    for (const photo of plan.ready) verifyFile(photo, publicRoot);
    const apply = process.argv.includes('--apply');
    const { created, existing } = apply
      ? await prisma.$transaction((tx) => applyImport(tx, plan.ready), { timeout: 120000, isolationLevel: 'Serializable' })
      : { created: 0, existing: 0 };
    const report = { mode: apply ? 'apply' : 'dry-run', reviewed: manifest.photos.filter((p) => p.reviewed).length, ready: plan.ready.length, created, existing,
      assignments: plan.ready.map(summarizeAssignment), skipped: plan.skipped };
    if (value('--report')) fs.writeFileSync(value('--report'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
module.exports = { planImport, verifyFile, captureDay, applyImport, summarizeAssignment };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planImport, verifyFile, applyImport, summarizeAssignment } = require('./import');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const photo = { sourceId: 'drive-file', reviewed: true, captureLocal: '2017-04-01T20:30:00', dateEvidence: 'exif-original', filePath: '/uploads/games/drive-photos/a.jpg', sha256: 'a'.repeat(64), sizeBytes: 20, title: 'קהל ושחקנים' };
const fixture = { id: 'game-1', dateTime: '2017-04-01T18:10:00Z', homeTeam: { nameHe: 'הפועל באר שבע' }, awayTeam: { nameHe: 'מכבי תל אביב' } };
test('reviewed original capture date links to the sole HBS fixture', () => {
  const p = planImport([photo], [fixture]);
  assert.equal(p.ready[0].gameId, 'game-1');
  assert.equal(p.skipped.length, 0);
});
test('fixture date is the Israel calendar date, including UTC midnight boundary', () => {
  const p = planImport([{ ...photo, captureLocal: '2017-04-02T01:05:00' }], [{ ...fixture, dateTime: '2017-04-01T22:10:00Z' }]);
  assert.equal(p.ready[0].gameId, 'game-1');
});
test('unreviewed photos and Drive upload dates cannot become gallery rows', () => {
  for (const extra of [{ reviewed: false }, { dateEvidence: 'drive-created' }, { captureLocal: null }, { captureLocal: '2017-02-30T20:00:00' }]) {
    assert.equal(planImport([{ ...photo, ...extra }], [fixture]).ready.length, 0);
  }
});
test('missing, ambiguous and unrelated fixtures are skipped', () => {
  for (const fixtures of [[], [fixture, { ...fixture, id: 'game-2' }], [{ ...fixture, homeTeam: { nameHe: 'הפועל חיפה' } }]]) {
    assert.equal(planImport([photo], fixtures).ready.length, 0);
  }
});
test('after-midnight capture is never silently moved to the previous day', () => {
  assert.equal(planImport([{ ...photo, captureLocal: '2017-04-02T00:15:00' }], [fixture]).ready.length, 0);
});
test('dry-run assignments expose source, capture date and exact fixture for review', () => {
  const ready = planImport([photo], [fixture]).ready;
  assert.deepEqual(summarizeAssignment(ready[0]), {
    sourceId: photo.sourceId, captureLocal: photo.captureLocal, gameId: fixture.id,
    fixtureDateTime: fixture.dateTime, homeTeam: 'הפועל באר שבע', awayTeam: 'מכבי תל אביב',
  });
});
test('duplicate content produces only one deterministic media asset', () => {
  const p = planImport([photo, { ...photo, sourceId: 'another-drive-copy' }], [fixture]);
  assert.equal(p.ready.length, 1);
  assert.match(p.ready[0].id, /^drive-photo-[a-f0-9]{64}$/);
});
test('verification rejects tampering and paths outside the photo directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-photo-test-'));
  try {
    fs.mkdirSync(path.join(root, 'uploads/games/drive-photos'), { recursive: true });
    const bytes = Buffer.from('verified image');
    fs.writeFileSync(path.join(root, 'uploads/games/drive-photos/a.jpg'), bytes);
    const valid = { ...photo, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
    assert.doesNotThrow(() => verifyFile(valid, root));
    assert.throws(() => verifyFile(photo, root), /hash|size/);
    assert.throws(() => verifyFile({ ...valid, filePath: '/uploads/games/drive-photos/../../secret.jpg' }, root), /path/i);
    fs.symlinkSync(path.join(root, 'uploads'), path.join(root, 'uploads/games/drive-photos/link'));
    assert.throws(() => verifyFile({ ...valid, filePath: '/uploads/games/drive-photos/link/anything.jpg' }, root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('repeated imports do not duplicate photos or overwrite existing gallery rows', async () => {
  const rows = new Map([['existing', { id: 'existing', gameId: 'game-1', displayOrder: 4, title: 'keep', isPrimary: true }]]);
  const tx = { mediaAsset: {
    findUnique: async ({ where }) => rows.get(where.id),
    aggregate: async () => ({ _max: { displayOrder: Math.max(...[...rows.values()].map((r) => r.displayOrder)) } }),
    create: async ({ data }) => { rows.set(data.id, data); },
  } };
  const ready = planImport([photo], [fixture]).ready;
  assert.deepEqual(await applyImport(tx, ready), { created: 1, existing: 0 });
  assert.deepEqual(await applyImport(tx, ready), { created: 0, existing: 1 });
  assert.equal(rows.size, 2);
  assert.equal(rows.get(ready[0].id).displayOrder, 5);
  assert.equal(rows.get('existing').title, 'keep');
  assert.equal(rows.get('existing').isPrimary, true);
  await assert.rejects(applyImport(tx, [{ ...ready[0], gameId: 'other-game' }]), /conflicts/);
});

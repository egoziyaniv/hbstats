const { schedulingStatusUpdate } = require('../../../scripts/lib/fixture-schedule-status');
const game = { status: 'SCHEDULED', statusShort: 'NS', statusLong: 'Not Started' };

it.each([['PST', 'Match Postponed', 'SCHEDULED'], ['CANC', 'Match Cancelled', 'CANCELLED']])('persists %s independent of an unchanged kickoff or final result', (short, long, status) => {
  expect(schedulingStatusUpdate(game, { short, long })).toEqual({ statusShort: short, statusLong: long, ...(status === game.status ? {} : { status }) });
});
it.each(['ONGOING', 'COMPLETED'])('does not downgrade %s from stale scheduling metadata', (status) => {
  expect(schedulingStatusUpdate({ ...game, status }, { short: 'PST', long: 'Match Postponed' })).toEqual({});
  expect(schedulingStatusUpdate({ ...game, status }, { short: 'CANC', long: 'Match Cancelled' })).toEqual({});
});
it('clears an earlier postponement when a confirmed schedule returns', () => {
  expect(schedulingStatusUpdate({ ...game, statusShort: 'PST', statusLong: 'Match Postponed' }, { short: 'NS', long: 'Not Started' })).toEqual({ statusShort: 'NS', statusLong: 'Not Started' });
});
it('avoids meaningless updates and never clears metadata on incomplete provider payloads', () => {
  expect(schedulingStatusUpdate(game, { short: 'NS', long: 'Not Started' })).toEqual({});
  expect(schedulingStatusUpdate(game, {})).toEqual({});
});

it.each([
  ['SCHEDULED', 'PST', true], ['SCHEDULED', 'CANC', true],
  ['ONGOING', 'PST', false], ['COMPLETED', 'CANC', false],
])('cron applies unchanged-kickoff %s -> %s safely', async (storedStatus, short, shouldUpdate) => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const { runInNewContext } = require('node:vm');
  const scriptPath = resolve(process.cwd(), 'scripts/refresh-fixture-schedule.js');
  const kickoff = new Date('2026-10-01T17:00:00Z');
  const update = jest.fn().mockResolvedValue({});
  let complete!: () => void;
  let fail!: (reason: Error) => void;
  const done = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
  const client = { game: { findUnique: jest.fn().mockResolvedValue({ ...game, id: 'game', status: storedStatus, dateTime: kickoff, homeScore: null, awayScore: null }), update }, $disconnect: () => { complete(); } };
  runInNewContext(readFileSync(scriptPath, 'utf8'), {
    require: (name: string) => name === '@prisma/client' ? { PrismaClient: function () { return client; } } : name === 'fs' ? { existsSync: () => false } : name === './lib/fixture-schedule-status' ? { schedulingStatusUpdate } : require(name),
    __dirname: resolve(process.cwd(), 'scripts'),
    process: { env: { API_FOOTBALL_KEY: 'test' }, argv: ['node', scriptPath, '--league', '383', '--season', '2026'], exit: () => fail(new Error('script failed')) },
    console: { log: jest.fn(), error: jest.fn() },
    fetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ response: [{ fixture: { id: 123, date: kickoff.toISOString(), status: { short, long: short === 'PST' ? 'Match Postponed' : 'Match Cancelled' } } }] }) }),
  });
  await done;
  expect(update).toHaveBeenCalledTimes(shouldUpdate ? 1 : 0);
  if (shouldUpdate) {
    expect(update.mock.calls[0][0].data.statusShort).toBe(short);
    expect(update.mock.calls[0][0].data.dateTime).toBeUndefined();
    if (short === 'CANC') expect(update.mock.calls[0][0].data.status).toBe('CANCELLED');
  }
});

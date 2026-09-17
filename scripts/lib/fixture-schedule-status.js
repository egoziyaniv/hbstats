'use strict';

/** Scheduling changes must propagate even when kickoff and scores are unchanged.
 * Never let a stale pre-match payload downgrade a live or completed game.
 */
function schedulingStatusUpdate(game, providerStatus) {
  if (!['SCHEDULED', 'CANCELLED'].includes(game.status)) return {};
  const short = String(providerStatus?.short || '').trim().toUpperCase();
  if (!['NS', 'TBD', 'PST', 'CANC', 'SUSP', 'INT', 'ABD'].includes(short)) return {};
  const long = typeof providerStatus?.long === 'string' ? providerStatus.long : null;
  const data = {};
  if (game.statusShort !== short) data.statusShort = short;
  if (game.statusLong !== long) data.statusLong = long;
  if (['CANC', 'ABD'].includes(short) && game.status !== 'CANCELLED') data.status = 'CANCELLED';
  // An explicit re-scheduling can revive a previously cancelled fixture.
  if (['NS', 'TBD', 'PST'].includes(short) && game.status === 'CANCELLED') data.status = 'SCHEDULED';
  return data;
}

module.exports = { schedulingStatusUpdate };

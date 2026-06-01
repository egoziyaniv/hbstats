/**
 * Sofascore Runner — wraps the 3 admin-relevant scrape/backfill scripts
 * (per-match ratings, team aggregate stats, lineup-rating backfill) for
 * the /admin/sofascore UI. Spawns each script and exposes the same
 * polling-friendly status shape as flashscore-runner.
 */

import { spawn } from 'child_process';
import path from 'path';

export type SofascoreAction = 'ratings-season' | 'team-stats' | 'backfill';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

type SofascoreState = {
  running: boolean;
  action: SofascoreAction | null;
  label: string | null;
  args: string[];
  startedAt: string | null;
  finishedAt: string | null;
  status: StepStatus;
  exitCode: number | null;
  output: string;
  error: string | null;
};

let state: SofascoreState = {
  running: false,
  action: null,
  label: null,
  args: [],
  startedAt: null,
  finishedAt: null,
  status: 'pending',
  exitCode: null,
  output: '',
  error: null,
};

export function getSofascoreStatus(): SofascoreState {
  return { ...state };
}

function appendOutput(text: string) {
  state.output += text;
  if (state.output.length > 200_000) state.output = state.output.slice(-200_000);
}

const ACTION_TO_SCRIPT: Record<SofascoreAction, { script: string; label: string }> = {
  'ratings-season': { script: 'scripts/scrape-sofascore-firecrawl.js', label: 'משיכת ציוני שחקנים מ-Sofascore' },
  'team-stats':     { script: 'scripts/scrape-sofascore-team-stats.js', label: 'משיכת סטטיסטיקות קבוצה מ-Sofascore' },
  'backfill':       { script: 'scripts/backfill-player-ratings.js',     label: 'Backfill ציונים מ-Flashscore Lineup Entries' },
};

export async function runSofascoreAction(action: SofascoreAction, extraArgs: string[] = []): Promise<void> {
  const cfg = ACTION_TO_SCRIPT[action];
  if (!cfg) throw new Error(`Unknown sofascore action: ${action}`);

  state = {
    running: true,
    action,
    label: cfg.label,
    args: extraArgs,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    exitCode: null,
    output: '',
    error: null,
  };

  const scriptPath = path.resolve(process.cwd(), cfg.script);
  appendOutput(`$ node ${cfg.script} ${extraArgs.join(' ')}\n\n`);

  await new Promise<void>((resolve) => {
    const child = spawn('node', [scriptPath, ...extraArgs], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    child.stdout.on('data', (b: Buffer) => appendOutput(b.toString('utf-8')));
    child.stderr.on('data', (b: Buffer) => appendOutput(b.toString('utf-8')));
    child.on('close', (code) => {
      state.exitCode = code ?? 0;
      state.status = (code ?? 0) === 0 ? 'done' : 'error';
      if (state.status === 'error') state.error = `Script exited with code ${code}`;
      state.finishedAt = new Date().toISOString();
      state.running = false;
      resolve();
    });
    child.on('error', (err) => {
      state.exitCode = -1;
      state.status = 'error';
      state.error = err.message;
      state.finishedAt = new Date().toISOString();
      state.running = false;
      appendOutput(`\nspawn error: ${err.message}\n`);
      resolve();
    });
  });
}

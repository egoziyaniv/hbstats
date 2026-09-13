import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(__dirname, '../../../scripts/call-cron.js');
let projectDir: string;
beforeEach(() => { projectDir = mkdtempSync(join(tmpdir(), 'statsai-cron-test-')); });
afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

function invoke(endpoint = 'notify-news', status = 200) {
  return spawnSync(process.execPath, ['-e', `
    const { runCron } = require(${JSON.stringify(script)});
    runCron(${JSON.stringify(endpoint)}, {
      projectDir: ${JSON.stringify(projectDir)},
      fetchImpl: async (url, options) => {
        console.log(JSON.stringify({ url, secret: options.headers['x-cron-secret'], timeout: !!options.signal }));
        return { ok: ${status >= 200 && status < 300}, status: ${status} };
      },
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
  `], { env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8' });
}

test.each(['"synthetic-secret=="', "'synthetic-secret=='"])(
  'passes dotenv secret %s unchanged in the header', (secret) => {
    writeFileSync(join(projectDir, '.env'), `CRON_SECRET=${secret}\n`);
    const result = invoke();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.split('\n')[0])).toEqual({
      url: 'http://localhost:3100/api/cron/notify-news',
      secret: 'synthetic-secret==', timeout: true,
    });
  }
);

test('reports HTTP failures with nonzero exit status', () => {
  writeFileSync(join(projectDir, '.env'), 'CRON_SECRET=synthetic-only\n');
  const result = invoke('on-this-day', 401);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('HTTP 401');
  expect(result.stderr).not.toContain('synthetic-only');
});

test('rejects unknown endpoints before making a request', () => {
  const result = invoke('../admin');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Unsupported cron endpoint');
  expect(result.stdout).toBe('');
});

test('does not send an unauthenticated request when secret is missing', () => {
  const result = invoke();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('CRON_SECRET is required');
  expect(result.stdout).toBe('');
});

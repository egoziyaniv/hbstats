#!/usr/bin/env node
// Authenticated local cron calls, using the same dotenv parsing as Next.js.
const { loadEnvConfig } = require('@next/env');
const path = require('node:path');

const ENDPOINTS = new Set(['notify-news', 'on-this-day']);

async function runCron(endpoint, {
  projectDir = path.resolve(__dirname, '..'),
  fetchImpl = fetch,
} = {}) {
  if (!ENDPOINTS.has(endpoint)) throw new Error('Unsupported cron endpoint');
  // Do not print dotenv errors: diagnostics may contain environment values.
  loadEnvConfig(projectDir, false, { info() {}, error() {} });
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is required');

  let response;
  try {
    response = await fetchImpl(`http://localhost:3100/api/cron/${endpoint}`, {
      headers: { 'x-cron-secret': secret },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(`Cron ${endpoint} request failed or timed out`);
  }
  if (!response.ok) throw new Error(`Cron ${endpoint} failed: HTTP ${response.status}`);
  console.log(`Cron ${endpoint} completed: HTTP ${response.status}`);
}

if (require.main === module) {
  runCron(process.argv[2]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runCron };

'use strict';
/**
 * ifa-firecrawl.js — Cloudflare-passing transport for football.org.il (IFA).
 *
 * As of 2026-08 IFA sits behind Cloudflare, which returns HTTP 403 to our
 * Hetzner datacenter IP even through a real headless browser (puppeteer /
 * puppeteer-real-browser can't clear the challenge from a datacenter IP —
 * verified). Firecrawl's `stealth` proxy renders IFA from a RESIDENTIAL IP with
 * the challenge solved; from inside that loaded page we run same-origin
 * `fetch()`s to the ASMX endpoints / content pages (exactly what the site's own
 * JS does) and get clean responses back. Same pattern the Sofascore scrapers
 * use (see scripts/scrape-sofascore-lineups.js).
 *
 * `ifaFetchMany([{ url, method?, body?, contentType? }, ...])` runs EVERY
 * request inside ONE Firecrawl render (one credit, one CF solve) and returns
 * `[{ status, body }, ...]` aligned to the input. Batch aggressively — a
 * round-by-round league discovery would otherwise be dozens of separate
 * renders.
 *
 * Fail-soft: on any Firecrawl transport error (missing key, no credits, render
 * failure) every item comes back as `{ status: 0, body: '' }`, so callers just
 * see "no data" and continue — the same behaviour as when IFA genuinely has
 * nothing. Set IFA_DEBUG=1 to log the underlying error.
 */
const fs = require('fs');
const path = require('path');

let FC_KEY = process.env.FIRECRAWL_API_KEY;
if (!FC_KEY) {
  try {
    const e = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8')
      .match(/^FIRECRAWL_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (e) FC_KEY = e[1].trim();
  } catch {}
}

// Any IFA page renders fine through the stealth proxy and gives us a CF-solved,
// same-origin context. The landing page is cheapest.
const IFA_RENDER_URL = process.env.IFA_RENDER_URL || 'https://www.football.org.il/';

// Render an IFA page via Firecrawl stealth (Cloudflare solved) and run `script`
// — a bare async IIFE expression — inside the page context; returns its string
// result. Throws on a Firecrawl transport error.
async function fcRenderJs(script) {
  if (!FC_KEY) throw new Error('Missing FIRECRAWL_API_KEY');
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: IFA_RENDER_URL,
      proxy: 'stealth',
      waitFor: 6000,
      formats: ['markdown'],
      actions: [
        { type: 'wait', milliseconds: 3500 },
        { type: 'executeJavascript', script },
      ],
    }),
  });
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Firecrawl non-JSON: ' + text.slice(0, 160)); }
  if (!d.success) throw new Error('Firecrawl error: ' + String(d.error || JSON.stringify(d)).slice(0, 200));
  const raw = (d.data && d.data.actions && d.data.actions.javascriptReturns || [])[0];
  const val = raw && raw.value;
  if (val == null) throw new Error('No JS return from Firecrawl action');
  return typeof val === 'string' ? val : JSON.stringify(val);
}

// Run many same-origin fetches inside ONE render. Returns [{ status, body }]
// aligned to `requests`. Fail-soft (zeroed items) on any transport error.
async function ifaFetchMany(requests) {
  if (!requests || !requests.length) return [];
  const reqs = requests.map((r) => ({
    url: r.url,
    method: r.method || 'GET',
    body: r.body != null ? r.body : null,
    contentType: r.contentType || 'application/json; charset=utf-8',
  }));
  const script =
    `(async()=>{const REQ=${JSON.stringify(reqs)};const out=[];` +
    `for(const q of REQ){try{` +
    `const opt={headers:{'Accept-Language':'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'},credentials:'include'};` +
    `if(q.method&&q.method!=='GET'){opt.method=q.method;opt.headers['Content-Type']=q.contentType;opt.headers['X-Requested-With']='XMLHttpRequest';if(q.body!=null)opt.body=q.body;}` +
    `const r=await fetch(q.url,opt);out.push({status:r.status,body:await r.text()});` +
    `}catch(e){out.push({status:0,body:'',error:String(e)});}}` +
    `return JSON.stringify(out);})()`;
  try {
    const raw = await fcRenderJs(script);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== requests.length) {
      return requests.map(() => ({ status: 0, body: '' }));
    }
    return arr;
  } catch (e) {
    if (process.env.IFA_DEBUG) console.error('  [ifa-firecrawl] ' + e.message);
    return requests.map(() => ({ status: 0, body: '', error: e.message }));
  }
}

async function ifaFetchOne(request) {
  const [r] = await ifaFetchMany([request]);
  return r || { status: 0, body: '' };
}

module.exports = { ifaFetchMany, ifaFetchOne, fcRenderJs, hasKey: () => !!FC_KEY };

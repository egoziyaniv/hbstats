// Keyless YouTube access: the public search results page and watch page both embed their data
// as JSON (ytInitialData / ytInitialPlayerResponse). Plain HTTP, no API quota. Server-side only.

import dns from 'node:dns';

// The server's IPv6 range is flagged by Google (watch pages answer with a /sorry captcha),
// while IPv4 is served normally — prefer IPv4 for these lookups.
dns.setDefaultResultOrder('ipv4first');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export interface YtSearchHit {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
}

export interface YtVideoMeta {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  publishedAt: Date | null;
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  return res.text();
}

/** Pull `var NAME = {...};` out of a page. Brace-matched so nested JSON and strings are safe. */
export function extractJsonVar(html: string, name: string): any | null {
  const at = html.search(new RegExp(`${name}\\s*=\\s*\\{`));
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** "1:02:03" / "12:34" → seconds. */
export function parseDuration(text: string | null | undefined): number | null {
  if (!text || !/^\d+(:\d{1,2}){1,2}$/.test(text.trim())) return null;
  return text.trim().split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

const runsText = (o: any): string => o?.simpleText ?? (o?.runs ?? []).map((r: any) => r.text).join('') ?? '';

function collectVideoRenderers(node: any, out: any[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) collectVideoRenderers(x, out); return; }
  if (node.videoRenderer) { out.push(node.videoRenderer); return; }
  for (const k of Object.keys(node)) collectVideoRenderers(node[k], out);
}

export function parseSearchPage(html: string): YtSearchHit[] {
  const data = extractJsonVar(html, 'ytInitialData');
  const renderers: any[] = [];
  collectVideoRenderers(data, renderers);
  const seen = new Set<string>();
  const hits: YtSearchHit[] = [];
  for (const r of renderers) {
    if (!r.videoId || seen.has(r.videoId)) continue;
    seen.add(r.videoId);
    hits.push({
      videoId: r.videoId,
      title: runsText(r.title),
      channel: runsText(r.ownerText) || null,
      durationSec: parseDuration(runsText(r.lengthText)),
    });
  }
  return hits;
}

/** Search YouTube. `newestFirst` sorts by upload date (for recent games). */
export async function searchYouTube(query: string, opts: { newestFirst?: boolean } = {}): Promise<YtSearchHit[]> {
  const sp = opts.newestFirst ? '&sp=CAI%253D' : '';
  const html = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${sp}`);
  return parseSearchPage(html);
}

export function parseWatchPage(html: string, videoId: string): YtVideoMeta | null {
  const p = extractJsonVar(html, 'ytInitialPlayerResponse');
  const d = p?.videoDetails;
  if (!d?.title) return null;
  const mf = p?.microformat?.playerMicroformatRenderer;
  const date = mf?.publishDate || mf?.uploadDate;
  const publishedAt = date ? new Date(date) : null;
  return {
    videoId,
    title: d.title,
    channel: d.author ?? mf?.ownerChannelName ?? null,
    durationSec: d.lengthSeconds ? Number(d.lengthSeconds) : null,
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  };
}

/** Title, channel, length and exact publish date of one video. */
export async function fetchVideoMeta(videoId: string): Promise<YtVideoMeta | null> {
  const html = await get(`https://www.youtube.com/watch?v=${videoId}&hl=he`);
  return parseWatchPage(html, videoId);
}

/** A link the post points at, shown as a card or chip instead of its raw address. */
export type TelegramLink = {
  url: string;
  /** What a reader gets by following it: "סרטון באינסטגרם", "פודקאסט בספוטיפיי", or the domain. */
  label: string;
  kind: 'video' | 'audio' | 'article';
  /** Telegram's own preview of the link, when the post carries one. */
  title?: string | null;
};

export type TelegramChannelMessage = {
  id: string;
  /** The post's text with the channel's promo footer and Telegram's placeholders removed. */
  text: string;
  /** `text` without any URL — what the home page prints. Links live in `links`. */
  body: string;
  /** A one-word topic line some channels open with ("כדורגל"), lifted out of the body. */
  kicker: string | null;
  links: TelegramLink[];
  hasVideo: boolean;
  url: string;
  publishedAt: Date | null;
  imageUrl?: string | null;
  channelPhotoUrl?: string | null;
  sourceSlug: string;
  sourceLabel: string;
  teamLabel: string;
};

export type TelegramSource = {
  slug: string;
  label: string;
  teamLabel: string;
};

export const DEFAULT_TELEGRAM_SOURCES: TelegramSource[] = [
  { slug: 'sportbanegev', label: 'ספורט בנגב', teamLabel: 'כדורגל בדרום' },
  { slug: 'vasermilya', label: 'וסרמיליה', teamLabel: 'הפועל באר שבע' },
];

export function extractTelegramSlug(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.startsWith('@')) return normalized.slice(1).trim() || null;

  const match = normalized.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/i);
  if (match?.[1]) return match[1];

  if (/^[A-Za-z0-9_]+$/.test(normalized)) return normalized;
  return null;
}

export function normalizeTelegramSource(input: Partial<TelegramSource> & { slug?: string | null; url?: string | null }) {
  const slug = extractTelegramSlug(input.slug || input.url || '');
  if (!slug) return null;

  const label = String(input.label || '').trim() || slug;
  const teamLabel = String(input.teamLabel || '').trim() || 'ללא שיוך';

  return {
    slug,
    label,
    teamLabel,
  } satisfies TelegramSource;
}

const TELEGRAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripHtml(input: string) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

function extractMessageHtml(chunk: string) {
  const textMatch =
    chunk.match(/<div class="tgme_widget_message_text[^"]*"[\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/i) ||
    chunk.match(/<div class="tgme_widget_message_caption[^"]*"[\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/i);

  if (!textMatch) return '';
  // The lazy `</div></div>` can over-capture into the footer/reactions/meta that
  // follow the text (views, edit time, reaction counts). Cut at the first such
  // marker so the message body doesn't end with "…76 views edited 12:28 ❤ 2".
  return textMatch[1].split(
    /<(?:div|span)[^>]*class="tgme_widget_message_(?:footer|reactions|meta|views|date)/i
  )[0];
}

const URL_RE = /(?:https?:\/\/|www\.)\S+|\bt\.me\/\S+/gi;

// Shown by Telegram's web preview in place of media it will not play inline.
const TELEGRAM_PLACEHOLDER_RE = /Please open Telegram to view this post|VIEW IN TELEGRAM/gi;

/** "וסרמיליה בטלגרם 🚩 t.me/vasermilya" — the channel advertising itself at the end of a post. */
function isPromoLine(line: string) {
  const bare = line.replace(URL_RE, '').trim();
  // Only a link back to Telegram counts; a trailing Instagram link is the post's content.
  if (!bare) return /t\.me\//i.test(line);
  return bare.length <= 40 && /(בטלגרם|הצטרפו|לערוץ שלנו)/.test(bare);
}

/** Drops Telegram's placeholders and the channel's trailing self-promotion. */
export function cleanTelegramText(text: string) {
  const lines = text
    .replace(TELEGRAM_PLACEHOLDER_RE, '')
    // A repost can flatten the footer onto the last line: "…למשחק. וסרמיליה בטלגרם 🚩 https://t.me/vasermilya"
    .replace(/\s*(?:https?:\/\/)?t\.me\/[A-Za-z0-9_]+\/?\s*$/i, '')
    .replace(/\s+[^\n.!?]{0,25}בטלגרם[^\p{L}\n]*$/u, '')
    .split('\n')
    .map((l) => l.trimEnd());
  while (lines.length && (!lines[lines.length - 1].trim() || isPromoLine(lines[lines.length - 1]))) lines.pop();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The text a reader sees: no URLs, and no lines left empty by removing them. */
export function telegramBodyText(text: string) {
  const lines = text.split('\n');
  const isBareUrl = (l: string | undefined) => !!l && !!l.trim() && !l.replace(URL_RE, '').trim();
  return lines
    // "🎥 לצפייה ביוטיוב:" only introduces the link that follows; the link becomes a card.
    .filter((l, i) => !(/:\s*$/.test(l) && l.length <= 40 && isBareUrl(lines.slice(i + 1).find((x) => x.trim()))))
    .map((l) => l.replace(URL_RE, '').replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A short first line with no punctuation or emoji, followed by more text: a topic tag. */
export function splitTelegramKicker(body: string): { kicker: string | null; body: string } {
  const [first, ...rest] = body.split('\n');
  const remainder = rest.join('\n').trim();
  if (remainder && first.length <= 18 && /^[\p{L} ]+$/u.test(first.trim()) && first.trim().split(/\s+/).length <= 2) {
    return { kicker: first.trim(), body: remainder };
  }
  return { kicker: null, body };
}

export function classifyTelegramLink(url: string): Omit<TelegramLink, 'url' | 'title'> {
  let host = '';
  let path = '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    host = u.hostname.replace(/^www\./, '');
    path = u.pathname;
  } catch {
    return { label: 'קישור', kind: 'article' };
  }
  if (/instagram\.com$/.test(host)) {
    return /\/(reel|reels|tv)\//.test(path) ? { label: 'סרטון באינסטגרם', kind: 'video' } : { label: 'פוסט באינסטגרם', kind: 'article' };
  }
  if (/(youtube\.com|youtu\.be)$/.test(host)) return { label: 'סרטון ביוטיוב', kind: 'video' };
  if (/tiktok\.com$/.test(host)) return { label: 'סרטון בטיקטוק', kind: 'video' };
  if (/spotify\.com$/.test(host)) return { label: 'פודקאסט בספוטיפיי', kind: 'audio' };
  if (/(facebook\.com|fb\.watch)$/.test(host)) return { label: 'פוסט בפייסבוק', kind: 'article' };
  if (/(twitter\.com|x\.com)$/.test(host)) return { label: 'פוסט ב-X', kind: 'article' };
  return { label: host || 'קישור', kind: 'article' };
}

function extractLinks(html: string, chunk: string, slug: string): TelegramLink[] {
  const previewTitle = chunk.match(/link_preview_title[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const previewUrl = chunk.match(/<a class="tgme_widget_message_link_preview" href="([^"]+)"/i)?.[1];
  const hrefs = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/gi)].map((m) => decodeHtmlEntities(m[1]));
  if (previewUrl) hrefs.push(decodeHtmlEntities(previewUrl));
  const seen = new Set<string>();
  const links: TelegramLink[] = [];
  for (const url of hrefs) {
    // A link back to the channel (the promo footer) or to this very post ("VIEW IN TELEGRAM")
    // is not content.
    if (new RegExp(`t\\.me/(s/)?${slug}(/\\d+)?/?([?#].*)?$`, 'i').test(url)) continue;
    const key = url.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const isPreview = previewUrl && decodeHtmlEntities(previewUrl).replace(/[?#].*$/, '') === key;
    links.push({ url, ...classifyTelegramLink(url), title: isPreview && previewTitle ? stripHtml(previewTitle) : null });
  }
  return links;
}

function extractMessageUrl(chunk: string) {
  return chunk.match(/<a class="tgme_widget_message_date" href="([^"]+)"/i)?.[1] || null;
}

function extractPublishedAt(chunk: string) {
  const raw = chunk.match(/<time datetime="([^"]+)"/i)?.[1] || null;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTelegramMediaUrl(value: string | null | undefined) {
  const decoded = decodeHtmlEntities((value || '').trim());
  if (!decoded) return null;
  if (decoded.startsWith('//')) return `https:${decoded}`;
  return decoded;
}

function extractImageUrl(chunk: string) {
  const candidates = [
    chunk.match(/tgme_widget_message_photo_wrap[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_photo[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_grouped_layer[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_video_thumb[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_link_preview_image[^>]*style="[^"]*url\((['"]?)(.*?)\1\)[^"]*"/i)?.[2],
    chunk.match(/tgme_widget_message_video_player[^>]*poster="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_photo_wrap[^>]*data-content-cover="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_photo_wrap[^>]*data-cover="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_link_preview_image[^>]*data-content-cover="([^"]+)"/i)?.[1],
    chunk.match(/tgme_widget_message_link_preview_image[^>]*data-cover="([^"]+)"/i)?.[1],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTelegramMediaUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export async function fetchTelegramChannelMessages(
  source: string | TelegramSource,
  limit = 5
): Promise<TelegramChannelMessage[]> {
  const normalizedSource =
    typeof source === 'string'
      ? { slug: source, label: source, teamLabel: 'ללא שיוך' }
      : source;

  const response = await fetch(`https://t.me/s/${normalizedSource.slug}`, {
    cache: 'no-store',
    headers: {
      'user-agent': TELEGRAM_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Telegram request failed with status ${response.status}`);
  }

  const html = await response.text();

  // Extract channel photo from page header
  const channelPhotoMatch = html.match(/tgme_page_photo_image[^>]*><img src="([^"]+)"/i);
  const channelPhotoUrl = channelPhotoMatch?.[1] || null;

  const chunks = html
    .split('<div class="tgme_widget_message_wrap')
    .slice(1)
    .map((chunk) => `<div class="tgme_widget_message_wrap${chunk}`);

  const messages: TelegramChannelMessage[] = [];

  for (const chunk of chunks) {
    const url = extractMessageUrl(chunk);
    const html = extractMessageHtml(chunk);
    const text = cleanTelegramText(stripHtml(html));
    if (!url || !text) continue;
    const { kicker, body } = splitTelegramKicker(telegramBodyText(text));

    messages.push({
      id: url.split('/').pop() || url,
      text,
      body,
      kicker,
      links: extractLinks(html, chunk, normalizedSource.slug),
      // Telegram's web view can't play some media and shows a placeholder; in these channels that is a video.
      hasVideo: /tgme_widget_message_(?:video|roundvideo)|message_media_not_supported/i.test(chunk),
      url,
      publishedAt: extractPublishedAt(chunk),
      imageUrl: extractImageUrl(chunk),
      channelPhotoUrl,
      sourceSlug: normalizedSource.slug,
      sourceLabel: normalizedSource.label,
      teamLabel: normalizedSource.teamLabel,
    });
  }

  return dedupeTelegramMessages(messages)
    .sort((a, b) => {
      const dateDiff = (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0);
      if (dateDiff !== 0) return dateDiff;

      const aId = Number(a.id);
      const bId = Number(b.id);
      if (Number.isFinite(aId) && Number.isFinite(bId)) {
        return bId - aId;
      }

      return b.id.localeCompare(a.id);
    })
    .slice(0, limit);
}

/** A channel sometimes posts the same text twice — once plain, then again with the video.
 *  Keep one, preferring the copy that carries media. */
export function dedupeTelegramMessages(messages: TelegramChannelMessage[]) {
  const norm = (m: TelegramChannelMessage) => `${m.sourceSlug}|${m.body.replace(/\s+/g, ' ').trim()}`;
  const best = new Map<string, TelegramChannelMessage>();
  for (const m of messages) {
    if (!m.body) { best.set(`${m.sourceSlug}|#${m.id}`, m); continue; }
    const k = norm(m);
    const cur = best.get(k);
    const media = (x: TelegramChannelMessage) => Number(x.hasVideo) + Number(Boolean(x.imageUrl));
    if (!cur || media(m) > media(cur) || (media(m) === media(cur) && (m.publishedAt?.getTime() || 0) > (cur.publishedAt?.getTime() || 0))) {
      best.set(k, m);
    }
  }
  return [...best.values()];
}

export async function fetchTelegramMessagesFromSources(sources: TelegramSource[], limitPerSource = 5) {
  const messages = await Promise.all(
    sources.map((source) => fetchTelegramChannelMessages(source, limitPerSource).catch(() => []))
  );

  return messages
    .flat()
    .sort((a, b) => {
      const dateDiff = (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0);
      if (dateDiff !== 0) return dateDiff;
      return b.id.localeCompare(a.id);
    });
}

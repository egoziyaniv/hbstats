import type { TelegramChannelMessage, TelegramLink } from '@/lib/telegram';

const TZ = 'Asia/Jerusalem';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const timeOf = (d: Date) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

function dayLabel(d: Date, now: Date) {
  const key = dayKey(d);
  if (key === dayKey(now)) return 'היום';
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return 'אתמול';
  return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' }).format(d);
}

/** Long posts open in place; most are 1–3 lines and show whole. */
const COLLAPSE_AT = 280;

function LinkChip({ link }: { link: TelegramLink }) {
  const icon = link.kind === 'video' ? '▶' : link.kind === 'audio' ? '🎧' : '↗';
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="flex max-w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[12px] transition hover:border-[var(--accent)]/40 hover:bg-white"
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] text-white ${link.kind === 'video' ? 'bg-gradient-to-br from-amber-500 via-rose-600 to-violet-600' : link.kind === 'audio' ? 'bg-emerald-600' : 'bg-stone-500'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-bold text-stone-800">{link.label}</span>
        {link.title ? <span className="block truncate text-[11px] text-stone-500">{link.title}</span> : null}
      </span>
    </a>
  );
}

/** A small picture beside the text, as in a live blog; the post opens in Telegram. */
function PostThumb({ message }: { message: TelegramChannelMessage }) {
  if (!message.imageUrl && !message.hasVideo) return null;
  return (
    <a
      href={message.url}
      target="_blank"
      rel="noreferrer"
      aria-label={message.hasVideo ? 'לצפייה בסרטון בטלגרם' : 'לתמונה בטלגרם'}
      className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-800"
    >
      {message.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={message.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : null}
      {message.hasVideo ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[9px] text-stone-900 shadow">▶</span>
        </span>
      ) : null}
    </a>
  );
}

function PostText({ text }: { text: string }) {
  if (text.length <= COLLAPSE_AT) {
    return <p className="whitespace-pre-line text-[13.5px] leading-6 text-stone-800">{text}</p>;
  }
  return (
    <details className="group">
      <summary className="list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <p className="line-clamp-4 whitespace-pre-line text-[13.5px] leading-6 text-stone-800 group-open:line-clamp-none">{text}</p>
        <span className="mt-0.5 inline-block cursor-pointer text-[11px] font-bold text-[var(--accent)] group-open:hidden">המשך קריאה ↓</span>
      </summary>
    </details>
  );
}

export function TelegramLiveFeed({ messages, now = new Date() }: { messages: TelegramChannelMessage[]; now?: Date }) {
  let lastDay = '';
  return (
    <ol className="relative">
      {messages.map((message) => {
        const at = message.publishedAt;
        const day = at ? dayLabel(at, now) : '';
        const showDay = day && day !== lastDay;
        lastDay = day || lastDay;
        return (
          <li key={`${message.sourceSlug}-${message.id}`}>
            {showDay ? <div className="pb-1 pt-3 text-[11px] font-black tracking-wide text-stone-400">{day}</div> : null}
            <article className="grid grid-cols-[42px_minmax(0,1fr)] gap-2 border-t border-stone-100 py-3">
              <time dateTime={at?.toISOString()} className="pt-0.5 text-[12px] font-black tabular-nums text-[var(--accent)]">
                {at ? timeOf(at) : ''}
              </time>
              <div className="min-w-0 space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">{message.body ? <PostText text={message.body} /> : null}</div>
                  <PostThumb message={message} />
                </div>
                {message.links.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {message.links.slice(0, 2).map((link) => <LinkChip key={link.url} link={link} />)}
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                  <span>{message.sourceLabel}</span>
                  {message.kicker ? <span className="rounded-full bg-stone-100 px-1.5 py-px font-semibold text-stone-500">{message.kicker}</span> : null}
                  <a href={message.url} target="_blank" rel="noreferrer" className="mr-auto font-bold text-stone-400 hover:text-[var(--accent)]">בטלגרם ←</a>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

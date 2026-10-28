'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export type HeroSlide = {
  id: string;
  status: string;
  label: string;            // "משחק חי" / "משחק אחרון" / "המשחק הבא"
  seasonName: string;
  competitionName: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  minuteLabel: string | null;
  dateLabel: string;
  showScore: boolean;       // live or completed → show scoreline
  showTeaser: boolean;      // scheduled → show the pre-match teaser line
  kickoffIso: string;
};

/** The team's most recent result, kept beside the next game so it is never buried. */
export type HeroLastResult = {
  id: string;
  meta: string;             // "ליגת העל · מחזור 8"
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  result: 'W' | 'D' | 'L';
  headline: string;
};

const RESULT_STYLE: Record<HeroLastResult['result'], { label: string; cls: string }> = {
  W: { label: 'ניצחון', cls: 'bg-emerald-400 text-emerald-950' },
  D: { label: 'תיקו', cls: 'bg-white/80 text-stone-800' },
  L: { label: 'הפסד', cls: 'bg-stone-900/70 text-white' },
};

function useCountdown(iso: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso || now === null) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  return { days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), minutes: mins % 60 };
}

function LastResultPanel({ r }: { r: HeroLastResult }) {
  const style = RESULT_STYLE[r.result];
  return (
    <Link
      href={`/games/${r.id}`}
      className="group flex h-full flex-col justify-center gap-2 rounded-2xl bg-black/15 px-4 py-3 ring-1 ring-white/10 transition hover:bg-black/25 focus:outline-none focus:ring-2 focus:ring-white/60"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">משחק אחרון</span>
        <span className="truncate text-[10px] font-semibold text-white/50">{r.meta}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <span className="truncate text-center text-sm font-black text-white">{r.homeName}</span>
        <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xl font-black tabular-nums text-white">
          <span>{r.homeScore}</span><span className="text-white/30">–</span><span>{r.awayScore}</span>
        </span>
        <span className="truncate text-center text-sm font-black text-white">{r.awayName}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${style.cls}`}>{style.label}</span>
        <span className="min-w-0 truncate text-xs font-bold text-white/85">{r.headline}</span>
        <span className="mr-auto shrink-0 text-[11px] font-bold text-white/60 group-hover:text-white">לפרטים ←</span>
      </div>
    </Link>
  );
}

const ROTATE_MS = 7000;

/**
 * The home hero, rotating through several relevant matches (live + soonest
 * upcoming, already ranked by the server). Auto-advances every ~7s, pauses on
 * hover/focus, and offers dot navigation. Falls back to a single static slide.
 */
export function HeroMatchCarousel({ slides, lastResult = null }: { slides: HeroSlide[]; lastResult?: HeroLastResult | null }) {
  const n = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (n <= 1 || paused) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), ROTATE_MS);
    return () => clearInterval(t);
  }, [n, paused]);

  const s = n ? slides[Math.min(i, n - 1)] : null;
  const countdown = useCountdown(s && s.status === 'SCHEDULED' ? s.kickoffIso : null);
  if (!s) return null;
  const live = s.status === 'ONGOING';
  const completed = s.status === 'COMPLETED';
  // Don't show the last game twice when it is already the slide.
  const sideResult = lastResult && !slides.some((sl) => sl.id === lastResult.id) ? lastResult : null;

  return (
    <section
      className="hero-featured-match relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative mx-auto max-w-7xl px-4 pb-5 pt-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-yellow-300' : completed ? 'bg-emerald-300' : 'bg-white/50'}`} />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">{s.label}</span>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">{s.seasonName}</span>
        </div>

        <div className={sideResult ? 'grid gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]' : ''}>
        {sideResult ? <div className="order-2 md:order-none"><LastResultPanel r={sideResult} /></div> : null}
        {/* key on id re-triggers the fade when the slide changes */}
        <Link href={`/games/${s.id}`} className="block rounded-2xl bg-black/10 px-3 py-4 transition hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/60" aria-label={`${s.homeName} נגד ${s.awayName}`}>
          <div key={s.id} className="hero-slide-fade text-center">
            <div className="text-[11px] font-bold text-white/55">{s.competitionName}</div>
            <div className="mt-3 flex items-center justify-center gap-5 md:gap-14">
              <div className="min-w-[90px] text-center">
                <div className="text-lg font-black text-white md:text-3xl leading-tight">{s.homeName}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">בית</div>
              </div>
              <div className="flex flex-col items-center">
                {s.showScore ? (
                  <div className="rounded-xl bg-white/10 px-6 py-2 backdrop-blur-sm ring-1 ring-white/10">
                    <div className="text-3xl font-black tabular-nums text-white md:text-5xl">
                      {s.homeScore}<span className="mx-2 text-white/25">–</span>{s.awayScore}
                    </div>
                    <div className={`mt-0.5 text-center text-[9px] font-bold tracking-widest ${live ? 'animate-pulse text-yellow-300' : 'text-emerald-300'}`}>
                      {live ? (s.minuteLabel || 'חי') : 'סיום'}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-white/10 px-6 py-2 backdrop-blur-sm ring-1 ring-white/10">
                    <div className="text-2xl font-black text-white md:text-3xl">נגד</div>
                    <div className="mt-1 text-center text-[10px] font-semibold text-white/60">{s.dateLabel}</div>
                    {countdown ? (
                      <div className="mt-1 text-center text-[10px] font-bold tabular-nums text-white/80">
                        בעוד {countdown.days === 1 ? 'יום ' : countdown.days > 1 ? `${countdown.days} ימים ` : ''}{countdown.hours} שע׳{countdown.days === 0 ? ` ${countdown.minutes} דק׳` : ''}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="min-w-[90px] text-center">
                <div className="text-lg font-black text-white md:text-3xl leading-tight">{s.awayName}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">חוץ</div>
              </div>
            </div>
            {s.showTeaser ? (
              <div className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-black text-white">למרכז המשחק · כושר, פציעות והרכבים ←</div>
            ) : null}
          </div>
        </Link>
        </div>

        {n > 1 ? (
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            {slides.map((sl, idx) => (
              <button
                key={sl.id}
                type="button"
                aria-label={`עבור למשחק ${idx + 1}`}
                aria-current={idx === i}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-white/85' : 'w-1.5 bg-white/30 hover:bg-white/55'}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

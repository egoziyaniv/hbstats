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
};

const ROTATE_MS = 7000;

/**
 * The home hero, rotating through several relevant matches (live + soonest
 * upcoming, already ranked by the server). Auto-advances every ~7s, pauses on
 * hover/focus, and offers dot navigation. Falls back to a single static slide.
 */
export function HeroMatchCarousel({ slides }: { slides: HeroSlide[] }) {
  const n = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (n <= 1 || paused) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), ROTATE_MS);
    return () => clearInterval(t);
  }, [n, paused]);

  if (!n) return null;
  const s = slides[Math.min(i, n - 1)];
  const live = s.status === 'ONGOING';
  const completed = s.status === 'COMPLETED';

  return (
    <section
      className="hero-featured-match relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative mx-auto max-w-7xl px-4 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-yellow-300' : completed ? 'bg-emerald-300' : 'bg-white/50'}`} />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">{s.label}</span>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">{s.seasonName}</span>
        </div>

        {/* key on id re-triggers the fade when the slide changes */}
        <Link href={`/games/${s.id}`} className="block" aria-label={`${s.homeName} נגד ${s.awayName}`}>
          <div key={s.id} className="hero-slide-fade text-center">
            <div className="text-[10px] font-medium text-white/35">{s.competitionName}</div>
            <div className="mt-2 flex items-center justify-center gap-6 md:gap-12">
              <div className="min-w-[90px] text-center">
                <div className="text-lg font-black text-white md:text-2xl leading-tight">{s.homeName}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">בית</div>
              </div>
              <div className="flex flex-col items-center">
                {s.showScore ? (
                  <div className="rounded-xl bg-white/10 px-6 py-2 backdrop-blur-sm ring-1 ring-white/10">
                    <div className="text-3xl font-black tabular-nums text-white md:text-4xl">
                      {s.homeScore}<span className="mx-2 text-white/25">–</span>{s.awayScore}
                    </div>
                    <div className={`mt-0.5 text-center text-[9px] font-bold tracking-widest ${live ? 'animate-pulse text-yellow-300' : 'text-emerald-300'}`}>
                      {live ? (s.minuteLabel || 'חי') : 'סיום'}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-white/10 px-6 py-2 backdrop-blur-sm ring-1 ring-white/10">
                    <div className="text-2xl font-black text-white md:text-3xl">VS</div>
                    <div className="mt-0.5 text-center text-[10px] text-white/50">{s.dateLabel}</div>
                  </div>
                )}
              </div>
              <div className="min-w-[90px] text-center">
                <div className="text-lg font-black text-white md:text-2xl leading-tight">{s.awayName}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">חוץ</div>
              </div>
            </div>
            {s.showTeaser ? (
              <div className="mt-3 text-[11px] font-bold text-white/70">לקראת המשחק · כושר, פציעות ותצוגה ←</div>
            ) : null}
          </div>
        </Link>

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

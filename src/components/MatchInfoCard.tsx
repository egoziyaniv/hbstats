/**
 * MatchInfoCard — venue / attendance / surface / weather for a game (FotMob).
 * Server component. Renders only the fields that are present.
 */
export type MatchInfo = {
  attendance?: number | null;
  stadium?: { name?: string; city?: string; country?: string; capacity?: number | null; surface?: string | null } | null;
  referee?: { name?: string; country?: string } | null;
  weather?: { temperature?: number | null; description?: string | null; iconCode?: number | null; windSpeed?: number | null; humidity?: number | null } | null;
};

const SURFACE_HE: Record<string, string> = { grass: 'דשא טבעי', 'artificial turf': 'דשא סינתטי', artificial: 'דשא סינתטי', hybrid: 'דשא היברידי' };
const weatherHe = (d: string | null | undefined) => {
  if (!d) return null;
  const s = d.toLowerCase();
  if (s.includes('clear') || s.includes('sun')) return 'בהיר';
  if (s.includes('cloud')) return 'מעונן';
  if (s.includes('rain') || s.includes('drizzle')) return 'גשום';
  if (s.includes('snow')) return 'שלג';
  if (s.includes('fog') || s.includes('mist')) return 'ערפילי';
  return d;
};
const weatherEmoji = (d: string | null | undefined) => {
  if (!d) return '🌡️';
  const s = d.toLowerCase();
  if (s.includes('clear') || s.includes('sun')) return '☀️';
  if (s.includes('cloud')) return '☁️';
  if (s.includes('rain') || s.includes('drizzle')) return '🌧️';
  if (s.includes('snow')) return '❄️';
  if (s.includes('fog') || s.includes('mist')) return '🌫️';
  return '🌡️';
};

export function MatchInfoCard({ info }: { info: MatchInfo }) {
  if (!info) return null;
  const st = info.stadium || {};
  const cap = st.capacity ?? null;
  const att = info.attendance ?? null;
  const pct = cap && att ? Math.round((att / cap) * 100) : null;
  const surface = st.surface ? (SURFACE_HE[st.surface.toLowerCase()] || st.surface) : null;
  const w = info.weather;
  const hasAny = st.name || att != null || surface || w;
  if (!hasAny) return null;

  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <h2 className="mb-4 border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">פרטי המשחק</h2>
      <div className="space-y-4 text-sm">
        {st.name ? (
          <div>
            <div className="font-black text-stone-900">{st.name}</div>
            {(st.city || st.country) ? <div className="text-stone-500">{[st.city, st.country].filter(Boolean).join(', ')}</div> : null}
          </div>
        ) : null}

        {(cap != null || att != null) ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              {cap != null ? <span className="text-stone-600">קיבולת <span className="font-bold text-stone-900">{cap.toLocaleString('he-IL')}</span></span> : <span />}
              {att != null ? <span className="text-stone-600">נוכחות <span className="font-bold text-stone-900">{att.toLocaleString('he-IL')}</span></span> : <span />}
            </div>
            {pct != null ? (
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="absolute inset-y-0 right-0 rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-black text-stone-700">{pct}%</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {surface ? <span className="text-stone-600">משטח <span className="font-bold text-stone-900">{surface}</span></span> : null}
          {w && (w.temperature != null || w.description) ? (
            <span className="flex items-center gap-1.5 text-stone-600">
              מזג אוויר
              <span className="font-bold text-stone-900">{w.temperature != null ? `${w.temperature}°C` : ''} {weatherHe(w.description) || ''}</span>
              <span>{weatherEmoji(w.description)}</span>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

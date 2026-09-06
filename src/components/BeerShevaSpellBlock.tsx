import Link from 'next/link';
import type { BeerShevaSpell } from '@shared/types/mobile-api';

const HONOR_STYLE: Record<string, string> = {
  'ליגת העל': 'bg-[var(--accent)] text-white',
  'גביע המדינה': 'bg-amber-100 text-amber-900 border border-amber-200',
  'אלוף האלופים': 'bg-stone-900 text-white',
};
const honorClass = (comp: string) =>
  HONOR_STYLE[comp] ?? 'bg-stone-100 text-stone-700 border border-stone-200';

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-4 text-center">
      <div className="text-2xl font-black text-stone-900">{value}</div>
      <div className="mt-0.5 text-xs font-semibold text-stone-500">{label}</div>
    </div>
  );
}

/**
 * "התקופה בהפועל באר שבע" — the club-scoped record. Career totals are meaningless on a
 * Beer Sheva site (דור מלול: 425 career appearances, 27 of them ours), so every number
 * here counts only games played for the club, and each season links to its own games.
 */
export default function BeerShevaSpellBlock({ spell }: { spell: BeerShevaSpell }) {
  const multiSeason = spell.seasons.length > 1;

  return (
    <section id="bs-spell" className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
          התקופה בהפועל באר שבע
        </h2>
        <span className="text-sm font-semibold text-stone-400">
          {spell.firstLabel}
          {spell.lastLabel !== spell.firstLabel ? `–${spell.lastLabel}` : ''}
        </span>
      </div>

      <p className="mt-4 leading-loose text-stone-700">{spell.summaryHe}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile value={spell.appearances} label="הופעות" />
        <Tile value={spell.goals} label="שערים" />
        <Tile value={spell.assists} label="בישולים" />
        <Tile value={spell.seasons.length} label="עונות" />
      </div>

      {spell.honors.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-stone-500">הישגים בתקופתו</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {spell.honors.map((h) => (
              <Link
                key={`${h.competitionHe}-${h.year}`}
                href="/club#honors"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition hover:opacity-85 ${honorClass(h.competitionHe)}`}
              >
                {h.competitionHe}
                <span className="opacity-70">{h.seasonLabel}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {multiSeason ? (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-500">
                <th className="px-3 py-2 font-bold">עונה</th>
                <th className="px-3 py-2 text-center font-bold">הופעות</th>
                <th className="px-3 py-2 text-center font-bold">שערים</th>
                <th className="px-3 py-2 text-center font-bold">בישולים</th>
                <th className="px-3 py-2 font-bold">הישגי הקבוצה</th>
              </tr>
            </thead>
            <tbody>
              {spell.seasons.map((s) => (
                <tr key={s.year} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-3 py-3">
                    <Link
                      href={`/teams/${s.teamId}`}
                      className="font-bold text-stone-900 hover:text-[var(--accent)]"
                    >
                      {s.label}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-stone-700">{s.appearances}</td>
                  <td className="px-3 py-3 text-center font-semibold text-stone-700">{s.goals || '-'}</td>
                  <td className="px-3 py-3 text-center font-semibold text-stone-700">{s.assists || '-'}</td>
                  <td className="px-3 py-3">
                    {s.honors.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.honors.map((h) => (
                          <span
                            key={h}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${honorClass(h)}`}
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

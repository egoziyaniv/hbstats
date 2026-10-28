import Link from 'next/link';

type ClubHubTile = {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  /** Filled in the club colour so it reads as the band's lead entry. */
  featured?: boolean;
};

const ICON_CLASS = 'h-5 w-5';

const TILES: ClubHubTile[] = [
  {
    // /club/season always resolves to the current season, so this never goes stale.
    href: '/club/season',
    title: 'תמונת עונה',
    subtitle: 'מאזן, שליטה, תזמון שערים וכובשים',
    featured: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS} aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  { href: '/club/calendar', title: 'יומן משחקים', subtitle: 'מנוי מתעדכן ליומן שלכם', icon: <span aria-hidden="true" className="text-xl">▦</span> },
  { href: '/matchdays', title: 'המשחקים שלי', subtitle: 'מאזן, אצטדיונים וזיכרונות', icon: <span aria-hidden="true" className="text-xl">✓</span> },
  { href: '/club/archive', title: 'ארכיון אוהדים', subtitle: 'סיפורים וכרטיסים מהיציע', icon: <span aria-hidden="true" className="text-xl">▤</span> },
  { href: '/club/matchday', title: 'מרכז יום משחק', subtitle: 'הכנה, הרכבים ומפגשי עבר', icon: <span aria-hidden="true" className="text-xl">⚽</span> },
  { href: '/club/eras', title: 'תקופות המועדון', subtitle: 'סיפורים לאורך השנים', icon: <span aria-hidden="true" className="text-xl">◷</span> },
  { href: '/club/quiz', title: 'חידון השבוע', subtitle: 'כמה אתם זוכרים?', icon: <span aria-hidden="true" className="text-xl">?</span> },
  {
    href: '/club',
    title: 'הקבוצה',
    subtitle: 'סגל, היסטוריה, אצטדיון',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS} aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
      </svg>
    ),
  },
  {
    href: '/club/seasons',
    title: 'תיקי עונה',
    subtitle: 'מאזנים, משחקים ומקורות',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS} aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 3v3M16 3v3" />
      </svg>
    ),
  },
  {
    href: '/songs',
    title: 'שירים',
    subtitle: 'שירי היציע',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS} aria-hidden="true">
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </svg>
    ),
  },
  {
    href: '/history',
    title: 'ארכיון והיסטוריה',
    subtitle: 'שיאים, יריבויות ותארים',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS} aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
];

export default function ClubHubBand() {
  return (
    <section className="modern-card mb-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-8 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-black text-stone-900">מרכז המועדון</h2>
          <p className="text-[12px] text-stone-400">הפועל באר שבע · הגמלים · האדומים מהדרום</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <Link
            key={`${tile.href}-${tile.title}`}
            href={tile.href}
            className={
              tile.featured
                ? 'group flex items-center gap-3 rounded-2xl border border-[var(--accent)] bg-[var(--accent)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                : 'group flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:shadow-md'
            }
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                tile.featured ? 'bg-white/20 text-white' : 'bg-[var(--accent-glow)] text-[var(--accent)]'
              }`}
            >
              {tile.icon}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-black transition ${
                  tile.featured ? 'text-white' : 'text-stone-900 group-hover:text-[var(--accent)]'
                }`}
              >
                {tile.title}
              </span>
              <span className={`block text-[12px] ${tile.featured ? 'text-white/80' : 'text-stone-400'}`}>{tile.subtitle}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

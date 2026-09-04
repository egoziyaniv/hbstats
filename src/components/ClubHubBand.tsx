import Link from 'next/link';

type ClubHubTile = {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
};

const ICON_CLASS = 'h-5 w-5';

const TILES: ClubHubTile[] = [
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
    href: '/club',
    title: 'היכל התהילה',
    subtitle: 'אגדות ותארים',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS} aria-hidden="true">
        <path d="M6 4h12v4a6 6 0 0 1-12 0V4z" />
        <path d="M6 5H4a2 2 0 0 0 2 4" />
        <path d="M18 5h2a2 2 0 0 1-2 4" />
        <path d="M12 14v3" />
        <path d="M9 20h6" />
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
    title: 'היסטוריה ושיאים',
    subtitle: '26 עונות',
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
            className="group flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-glow)] text-[var(--accent)]">
              {tile.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-stone-900 transition group-hover:text-[var(--accent)]">{tile.title}</span>
              <span className="block text-[12px] text-stone-400">{tile.subtitle}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

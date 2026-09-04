import Link from 'next/link';
import type { HallOfFameItem } from '@shared/types/mobile-api';

const ROLE_HE: Record<HallOfFameItem['role'], string> = {
  PLAYER: 'שחקן',
  COACH: 'מאמן',
  LEGEND: 'אגדה',
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

// A hall-of-fame legend card: photo or initials monogram, name, role+years,
// and a stat-line chip. Links to the legend profile page.
export default function LegendCard({ item }: { item: HallOfFameItem }) {
  const metaParts = [ROLE_HE[item.role], item.years].filter(Boolean) as string[];

  const inner = (
    <div className="modern-card flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition group-hover:border-[var(--accent)]/40 group-hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photoUrl}
            alt={item.nameHe}
            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--accent),#7f1d1d)]">
            <span className="text-4xl font-black text-white/90">{monogram(item.nameHe)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg font-black text-stone-900">{item.nameHe}</h3>
        {metaParts.length > 0 ? (
          <p className="mt-0.5 text-sm text-stone-500">{metaParts.join(' · ')}</p>
        ) : null}
        {item.blurbHe ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600">{item.blurbHe}</p>
        ) : null}
        {item.statLineHe ? (
          <span className="mt-3 inline-flex w-fit rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]">
            {item.statLineHe}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <Link href={`/club/legends/${item.id}`} className="group block">
      {inner}
    </Link>
  );
}

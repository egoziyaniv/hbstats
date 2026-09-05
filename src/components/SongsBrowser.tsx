'use client';

// src/components/SongsBrowser.tsx — smart, searchable browser for fan songs (RTL).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { SongType } from '@prisma/client';
import { SONG_TYPE_HE } from '@/lib/song-display';

export type BrowserSong = {
  id: string;
  slug: string;
  type: SongType;
  titleHe: string;
  lyricsSnippet: string | null;
  hasLyrics: boolean;
  originalMelody: string | null;
  performerGroup: string | null;
  thumbUrl: string | null;
  contentWarning: boolean;
  player: { id: string; nameHe: string; photoUrl: string | null } | null;
};

/** Section order + Hebrew headings. PLAYER first — it is the richest view. */
const SECTIONS: Array<{ type: SongType; heading: string; chip: string }> = [
  { type: 'PLAYER', heading: 'שירי שחקנים', chip: 'שירי שחקנים' },
  { type: 'STAND', heading: 'שירי יציע', chip: 'שירי יציע' },
  { type: 'CHAMPIONSHIP', heading: 'שירי אליפות', chip: 'אליפות' },
  { type: 'STUDIO', heading: 'שירי אולפן', chip: 'אולפן' },
];

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().trim();
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[1][0]}`;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20 3.5v11.2a3.3 3.3 0 1 1-2-3.03V7.6l-8 1.6v7.6a3.3 3.3 0 1 1-2-3.03V6.3l12-2.4Z" />
    </svg>
  );
}

function LyricsBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 5h14M5 10h14M5 15h9" strokeLinecap="round" />
      </svg>
      מילים
    </span>
  );
}

function WarningDot() {
  return (
    <span
      title="ייתכן תוכן בוטה"
      className="inline-flex h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-red-100"
      aria-label="ייתכן תוכן בוטה"
    />
  );
}

function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [broken, setBroken] = useState(false);

  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-16 w-16 shrink-0 rounded-full border border-stone-200 bg-stone-100 object-cover"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--accent),#7f1d1d)] text-lg font-black text-white">
      {initials(name)}
    </div>
  );
}

function PlayerSongCard({ song }: { song: BrowserSong }) {
  return (
    <Link
      href={`/songs/${song.slug}`}
      className="group modern-card flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow-md"
    >
      <PlayerAvatar name={song.player?.nameHe || song.titleHe} photoUrl={song.player?.photoUrl ?? null} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-black text-stone-900 group-hover:text-[var(--accent)]">
            {song.player?.nameHe || song.titleHe}
          </h3>
          {song.contentWarning ? <WarningDot /> : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-stone-600">{song.titleHe}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {song.hasLyrics ? <LyricsBadge /> : null}
          {song.performerGroup ? (
            <span className="truncate text-[11px] font-semibold text-stone-400">{song.performerGroup}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function MediaSongCard({ song }: { song: BrowserSong }) {
  return (
    <Link
      href={`/songs/${song.slug}`}
      className="group modern-card block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-stone-100">
        {song.thumbUrl ? (
          <img
            src={song.thumbUrl}
            alt={song.titleHe}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--accent),#7f1d1d)]">
            <MusicNoteIcon className="h-12 w-12 text-white/90" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <h3 className="line-clamp-1 flex-1 text-base font-black text-stone-900 group-hover:text-[var(--accent)]">
            {song.titleHe}
          </h3>
          {song.contentWarning ? <WarningDot /> : null}
        </div>
        {song.lyricsSnippet ? (
          <p className="mt-1 truncate text-sm text-stone-500">{song.lyricsSnippet}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {song.hasLyrics ? <LyricsBadge /> : null}
          {song.performerGroup ? (
            <span className="truncate text-[11px] font-semibold text-stone-400">{song.performerGroup}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function SongsBrowser({ songs }: { songs: BrowserSong[] }) {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<SongType | 'ALL'>('ALL');

  // Only the types that actually exist, in a fixed order; unknown types fall back to their Hebrew label.
  const sections = useMemo(() => {
    const counts = new Map<SongType, number>();
    for (const song of songs) counts.set(song.type, (counts.get(song.type) || 0) + 1);
    const known = SECTIONS.filter((section) => (counts.get(section.type) || 0) > 0);
    const extras = Array.from(counts.keys())
      .filter((type) => !SECTIONS.some((section) => section.type === type))
      .map((type) => ({ type, heading: SONG_TYPE_HE[type] || 'שירים', chip: SONG_TYPE_HE[type] || 'שירים' }));
    return [...known, ...extras].map((section) => ({ ...section, count: counts.get(section.type) || 0 }));
  }, [songs]);

  // Chips are derived from the full catalogue so they never flicker while typing.
  const chips = useMemo(
    () => [
      { key: 'ALL' as const, label: 'הכל', count: songs.length },
      ...sections.map((section) => ({ key: section.type, label: section.chip, count: section.count })),
    ],
    [songs, sections],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    return songs.filter((song) => {
      if (activeType !== 'ALL' && song.type !== activeType) return false;
      if (!q) return true;
      return (
        normalize(song.titleHe).includes(q) ||
        normalize(song.player?.nameHe).includes(q) ||
        normalize(song.lyricsSnippet).includes(q) ||
        normalize(song.originalMelody).includes(q) ||
        normalize(song.performerGroup).includes(q)
      );
    });
  }, [songs, query, activeType]);

  const groups = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: filtered.filter((song) => song.type === section.type),
        }))
        .filter((group) => group.items.length > 0),
    [filtered, sections],
  );

  return (
    <div className="mt-6">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-stone-400">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש שיר, שחקן או מילים…"
          aria-label="חיפוש שיר, שחקן או מילים"
          className="w-full rounded-2xl border border-stone-200/80 bg-white py-3 pr-12 pl-4 text-base text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
        />
      </div>

      {chips.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = activeType === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setActiveType(chip.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                }`}
              >
                {chip.label}
                <span className={`mr-1.5 text-xs font-bold ${active ? 'text-white/75' : 'text-stone-400'}`}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="mt-8 space-y-10">
          {groups.map((group) => (
            <section key={group.type}>
              <div className="flex items-baseline gap-3">
                <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
                  {group.heading}
                </h2>
                <span className="text-sm font-semibold text-stone-400">{group.items.length}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((song) =>
                  group.type === 'PLAYER' ? (
                    <PlayerSongCard key={song.id} song={song} />
                  ) : (
                    <MediaSongCard key={song.id} song={song} />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-stone-200/80 bg-white p-10 text-center shadow-sm">
          <MusicNoteIcon className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-base font-bold text-stone-700">
            {songs.length === 0 ? 'עדיין אין שירים להצגה.' : 'לא מצאנו שיר שמתאים לחיפוש.'}
          </p>
          {songs.length > 0 ? (
            <p className="mt-1 text-sm text-stone-500">אפשר לנסות שם שחקן, שורה מהשיר או שם של ארגון אוהדים.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

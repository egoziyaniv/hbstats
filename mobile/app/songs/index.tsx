/**
 * Songs browser — a searchable, grouped index of the club's chants.
 *
 * The list is fetched once (no type argument) so search spans every song;
 * type filtering and text search both run client-side. Songs are grouped by
 * type, with player chants leading on the player (photo + name) rather than
 * the song title — that is how fans look them up.
 */

import { useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Svg, Path, Circle } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { absoluteImage } from '@/lib/config';
import { useSongs } from '@/hooks/useSongs';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { TabBar } from '@/design-system/TabBar';
import { BottomNav } from '@/design-system/BottomNav';
import { CachedImage } from '@/design-system/CachedImage';
import { theme } from '@/design-system/theme';
import type { SongSummary, SongType } from '@shared/types/mobile-api';

const TYPE_HE: Record<SongType, string> = {
  PLAYER: 'שירי שחקנים',
  STAND: 'שירי יציע',
  CHAMPIONSHIP: 'שירי אליפות',
  STUDIO: 'שירי אולפן',
};

/** Section / chip order — player chants first, then the crowd songs. */
const TYPE_ORDER: SongType[] = ['PLAYER', 'STAND', 'CHAMPIONSHIP', 'STUDIO'];

// ---------------------------------------------------------------- icons

function MusicNote({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18V5l12-2v13" />
      <Path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <Path d="M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="7" />
      <Path d="M21 21l-4.5-4.5" />
    </Svg>
  );
}

function Chevron({ color }: { color: string }) {
  // Points to the start side (left edge of an RTL row) as a "go" affordance.
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

// ---------------------------------------------------------------- helpers

/** Two-letter monogram for players without a photo. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0].charAt(0) + words[1].charAt(0);
}

/** Every token of the query must appear somewhere in the song's text. */
function matchesQuery(song: SongSummary, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = [song.titleHe, song.player?.nameHe, song.performerGroup, TYPE_HE[song.type]]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

// ---------------------------------------------------------------- bits

function LyricsPill() {
  const { brand } = useTheme();
  return (
    <View style={{ backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: brand.accent, fontSize: 10, fontWeight: '800' }}>מילים</Text>
    </View>
  );
}

function WarningDot() {
  return (
    <View
      style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.status.liveFg, opacity: 0.75 }}
      accessibilityLabel="תוכן רגיש"
    />
  );
}

function RowMeta({ song }: { song: SongSummary }) {
  if (!song.hasLyrics && !song.contentWarning) return null;
  return (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 6 }}>
      {song.hasLyrics ? <LyricsPill /> : null}
      {song.contentWarning ? <WarningDot /> : null}
    </View>
  );
}

/** Round player avatar, or an initials monogram when there is no photo. */
function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const { brand } = useTheme();
  const uri = absoluteImage(photoUrl);
  if (uri) {
    return (
      <CachedImage
        source={{ uri }}
        style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.ink[100] }}
      />
    );
  }
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: brand.accentGlow,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: brand.accent, fontSize: 15, fontWeight: '900' }}>{initialsOf(name)}</Text>
    </View>
  );
}

/** Video thumbnail, or an accent block with a music note. */
function SongThumb({ thumbUrl }: { thumbUrl: string | null }) {
  const { brand } = useTheme();
  const uri = absoluteImage(thumbUrl);
  const size = { width: 64, height: 46, borderRadius: 9 } as const;
  if (uri) {
    return <CachedImage source={{ uri }} style={{ ...size, backgroundColor: theme.ink[100] }} />;
  }
  return (
    <View style={{ ...size, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center' }}>
      <MusicNote color={brand.accent} size={20} />
    </View>
  );
}

interface RowProps {
  song: SongSummary;
  last: boolean;
  onPress: () => void;
}

/** Player chant — led by the player, with the song title beneath. */
function PlayerSongRow({ song, last, onPress }: RowProps) {
  const primary = song.player?.nameHe ?? song.titleHe;
  const secondary = song.player ? song.titleHe : song.performerGroup;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          gap: 12,
          minHeight: 66,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.ink[100],
        }}
      >
        {song.player ? (
          <PlayerAvatar name={song.player.nameHe} photoUrl={song.player.photoUrl} />
        ) : (
          <SongThumb thumbUrl={song.thumbUrl} />
        )}
        <View style={{ flex: 1, alignItems: 'flex-start', gap: 2 }}>
          <Text style={{ color: theme.ink[900], fontSize: 14.5, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>
            {primary}
          </Text>
          {secondary ? (
            <Text style={{ color: theme.ink[500], fontSize: 12.5, fontWeight: '500', textAlign: 'right' }} numberOfLines={1}>
              {secondary}
            </Text>
          ) : null}
        </View>
        <RowMeta song={song} />
        <Chevron color={theme.ink[300]} />
      </View>
    </Pressable>
  );
}

/** Stand / studio / championship chant — led by the video thumbnail. */
function StandSongRow({ song, last, onPress }: RowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          gap: 12,
          minHeight: 66,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.ink[100],
        }}
      >
        <SongThumb thumbUrl={song.thumbUrl} />
        <View style={{ flex: 1, alignItems: 'flex-start', gap: 2 }}>
          <Text style={{ color: theme.ink[900], fontSize: 14.5, fontWeight: '800', textAlign: 'right' }} numberOfLines={2}>
            {song.titleHe}
          </Text>
          {song.performerGroup ? (
            <Text style={{ color: theme.ink[500], fontSize: 12.5, fontWeight: '500', textAlign: 'right' }} numberOfLines={1}>
              {song.performerGroup}
            </Text>
          ) : null}
        </View>
        <RowMeta song={song} />
        <Chevron color={theme.ink[300]} />
      </View>
    </Pressable>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  const { brand } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: brand.accentGlow,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <MusicNote color={brand.accent} size={30} />
      </View>
      <Text style={{ color: theme.ink[900], fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: theme.ink[500], fontSize: 13, textAlign: 'center', marginTop: 4 }}>{hint}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- screen

export default function SongsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<string>('all');

  // Fetch everything once so search covers songs outside the active filter.
  const { data, isLoading, refetch, isRefetching } = useSongs();
  const songs = useMemo(() => data?.songs ?? [], [data]);

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  /** Search first — chip counts reflect what the current search found. */
  const searched = useMemo(() => songs.filter((s) => matchesQuery(s, tokens)), [songs, tokens]);

  const countsByType = useMemo(() => {
    const counts = {} as Record<SongType, number>;
    for (const song of searched) counts[song.type] = (counts[song.type] ?? 0) + 1;
    return counts;
  }, [searched]);

  /** Only types actually present in the data get a chip (stable across search). */
  const presentTypes = useMemo(() => {
    const present = new Set(songs.map((s) => s.type));
    return TYPE_ORDER.filter((t) => present.has(t));
  }, [songs]);

  const tabs = useMemo(
    () => [
      { id: 'all', label: `הכל · ${searched.length}` },
      ...presentTypes.map((t) => ({ id: t, label: `${TYPE_HE[t]} · ${countsByType[t] ?? 0}` })),
    ],
    [presentTypes, countsByType, searched.length],
  );

  /** Groups to render: the active chip, or every present type. */
  const groups = useMemo(() => {
    const wanted = tab === 'all' ? presentTypes : presentTypes.filter((t) => t === tab);
    return wanted
      .map((type) => ({ type, items: searched.filter((s) => s.type === type) }))
      .filter((g) => g.items.length > 0);
  }, [tab, presentTypes, searched]);

  const openSong = (slug: string) => router.push(('/songs/' + encodeURIComponent(slug)) as any);

  const body = (() => {
    if (isLoading && !data) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      );
    }
    if (songs.length === 0) {
      return <EmptyState title="אין שירים להצגה" hint="השירים יתווספו כאן בקרוב." />;
    }
    if (groups.length === 0) {
      return (
        <EmptyState
          title="לא נמצאו שירים"
          hint={tokens.length > 0 ? 'נסו שם אחר של שיר או שחקן, או בחרו קטגוריה אחרת.' : 'נסו לבחור קטגוריה אחרת.'}
        />
      );
    }
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 28 }}
      >
        {groups.map((group) => (
          <Section key={group.type} title={`${TYPE_HE[group.type]} · ${group.items.length}`} dense>
            <Card pad={false}>
              {group.items.map((song, i, arr) =>
                group.type === 'PLAYER' ? (
                  <PlayerSongRow
                    key={song.id}
                    song={song}
                    last={i === arr.length - 1}
                    onPress={() => openSong(song.slug)}
                  />
                ) : (
                  <StandSongRow
                    key={song.id}
                    song={song}
                    last={i === arr.length - 1}
                    onPress={() => openSong(song.slug)}
                  />
                ),
              )}
            </Card>
          </Section>
        ))}
      </ScrollView>
    );
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="שירים" subtitle={songs.length > 0 ? `${songs.length} שירים` : null} />

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
        <View
          style={{
            flexDirection: rtlRow(),
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'white',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.ink[200],
            paddingHorizontal: 12,
            minHeight: 44,
          }}
        >
          <SearchIcon color={theme.ink[500]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש שיר, שחקן או מילים…"
            placeholderTextColor={theme.ink[500]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            accessibilityLabel="חיפוש שירים"
            style={{
              flex: 1,
              paddingVertical: 10,
              fontSize: 14,
              textAlign: 'right',
              writingDirection: 'rtl',
              color: theme.ink[900],
            }}
          />
        </View>
      </View>

      {tabs.length > 1 ? <TabBar items={tabs} value={tab} onChange={setTab} /> : null}

      {body}

      <BottomNav />
    </View>
  );
}

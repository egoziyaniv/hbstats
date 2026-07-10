import { useState, useEffect } from 'react';
import { rtlRow } from '@/lib/rtl';
import { CachedImage } from '@/design-system/CachedImage';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useStats } from '@/hooks/useStats';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { apiClient } from '@/lib/apiClient';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TabBar } from '@/design-system/TabBar';
import { SeasonChip } from '@/design-system/SeasonChip';
import { theme } from '@/design-system/theme';
import { useSeasonStore } from '@/lib/seasonStore';
import type { StatsLeaderEntry, SearchPayload } from '@shared/types/mobile-api';

type StatTab = 'scorers' | 'assists' | 'yellow' | 'red';

const TAB_ITEMS = [
  { id: 'scorers', label: 'כובשים' },
  { id: 'assists', label: 'בשלנים' },
  { id: 'yellow', label: 'צהובים' },
  { id: 'red', label: 'אדומים' },
];

const TAB_VALUE_LABEL: Record<StatTab, string> = {
  scorers: 'שערים',
  assists: 'בישולים',
  yellow: 'צהובים',
  red: 'אדומים',
};

export default function PlayersTab() {
  const router = useRouter();
  const { brand } = useTheme();
  const { selectedYear } = useSeasonStore();
  const { data, isLoading, refetch, isRefetching } = useStats(selectedYear);
  const [tab, setTab] = useState<StatTab>('scorers');
  const headerTitle = 'שחקנים מובילים';
  const headerSubtitle = data?.season?.name ? `עונת ${data.season.name}` : undefined;
  const headerRight = <SeasonChip />;

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const isSearching = search.trim().length >= 2;
  const { data: searchData, isFetching: searching, isError: searchError } = useQuery<SearchPayload>({
    queryKey: ['search', debounced],
    queryFn: () => apiClient.get<SearchPayload>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const searchResults = (searchData?.results ?? []).filter((r) => r.type === 'player' || r.type === 'team');

  const rows = (() => {
    if (!data) return [];
    switch (tab) {
      case 'scorers': return data.categories.topScorers;
      case 'assists': return data.categories.topAssists;
      case 'yellow':  return data.categories.topYellowCards;
      case 'red':     return data.categories.topRedCards;
    }
  })();

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title={headerTitle} subtitle={headerSubtitle} rightSlot={headerRight} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header />
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש שחקן או קבוצה…"
          placeholderTextColor={theme.ink[500]}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={{
            backgroundColor: 'white',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.ink[100],
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 14,
            textAlign: 'right',
            writingDirection: 'rtl',
            color: theme.ink[900],
          }}
        />
      </View>
      {isSearching ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 16, gap: 8, paddingBottom: 32 }}
        >
          {searching ? <ActivityIndicator color={brand.accent} /> : null}
          {searchResults.map((r) => (
            <Pressable key={`${r.type}-${r.id}`} onPress={() => router.push(r.href as any)}>
              <Card>
                <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
                      {r.type === 'team' ? '🛡️ ' : '👤 '}{r.label}
                    </Text>
                    {r.subtitle ? (
                      <Text style={{ fontSize: 11, color: theme.ink[500], textAlign: 'right' }} numberOfLines={1}>{r.subtitle}</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 16, color: theme.ink[300] }}>‹</Text>
                </View>
              </Card>
            </Pressable>
          ))}
          {searchError ? (
            <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>החיפוש נכשל, נסו שוב.</Text>
          ) : !searching && debounced === search.trim() && searchResults.length === 0 ? (
            // debounce settled + fetch idle + empty → genuinely no results (the
            // debounce-pending window must not flash a false "no results")
            <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>לא נמצאו תוצאות.</Text>
          ) : null}
        </ScrollView>
      ) : (
        <>
          <TabBar items={TAB_ITEMS} value={tab} onChange={(id) => setTab(id as StatTab)} />
          <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable
              onPress={() => router.push('/advanced-stats' as any)}
              style={{ backgroundColor: theme.ink[100], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[900] }}>סטטיסטיקה מתקדמת ›</Text>
            </Pressable>
          </View>
          <ScrollView
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
            contentContainerStyle={{ paddingVertical: 16, gap: 12, paddingBottom: 32 }}
          >
            {rows.length === 0 ? (
              <Card>
                <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                  אין נתונים זמינים בקטגוריה זו.
                </Text>
              </Card>
            ) : (
              <Card pad={false}>
                {rows.map((entry, i) => (
                  <LeaderRow
                    key={entry.playerId ? `${entry.playerId}-${i}` : `${entry.rank}-${entry.playerNameHe}`}
                    entry={entry}
                    valueLabel={TAB_VALUE_LABEL[tab]}
                    isLast={i === rows.length - 1}
                    onPress={entry.playerId ? () => router.push(`/players/${entry.playerId}` as any) : undefined}
                    brandAccent={brand.accent}
                    brandGlow={brand.accentGlow}
                  />
                ))}
              </Card>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function LeaderRow({
  entry,
  valueLabel,
  isLast,
  onPress,
  brandAccent,
  brandGlow,
}: {
  entry: StatsLeaderEntry;
  valueLabel: string;
  isLast: boolean;
  onPress?: () => void;
  brandAccent: string;
  brandGlow: string;
}) {
  const Content = (
    <View
      style={{
        flexDirection: rtlRow(),
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.ink[100],
      }}
    >
      <Text style={{ width: 24, fontSize: 13, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>
        {entry.rank}
      </Text>
      {absoluteImage(entry.photoUrl) ? (
        <CachedImage source={{ uri: absoluteImage(entry.photoUrl) }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100] }} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: theme.ink[700] }}>
            {entry.playerNameHe.slice(0, 1)}
          </Text>
        </View>
      )}
      {/* Name + team take their natural width and sit right next to the
          photo. The value badge below uses `marginStart: 'auto'` to push it
          to the opposite (visual left) edge of the row. */}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }}
          numberOfLines={1}
        >
          {entry.playerNameHe}
        </Text>
        <Text
          style={{ fontSize: 11, color: theme.ink[500], marginTop: 2, textAlign: 'right' }}
          numberOfLines={1}
        >
          {entry.teamNameHe}
          {entry.gamesPlayed != null ? ` · ${entry.gamesPlayed} משחקים` : ''}
        </Text>
      </View>
      <View style={{ marginStart: 'auto', alignItems: 'center', minWidth: 50, backgroundColor: brandGlow, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 17, fontWeight: '900', color: theme.ink[900] }}>
          {entry.value}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: brandAccent, marginTop: -2 }}>
          {valueLabel}
        </Text>
      </View>
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{Content}</Pressable>;
  return Content;
}

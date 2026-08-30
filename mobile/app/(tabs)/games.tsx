import { useEffect, useState } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { useRouter } from 'expo-router';
import { useGames } from '@/hooks/useGames';
import { useSeasonStore } from '@/lib/seasonStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { TabBar } from '@/design-system/TabBar';
import { TeamCrest } from '@/design-system/TeamCrest';
import { StatusPill } from '@/design-system/StatusPill';
import { SeasonChip } from '@/design-system/SeasonChip';
import { theme } from '@/design-system/theme';
import type { MatchCard } from '@shared/types/mobile-api';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function GameRow({
  m,
  isLast,
  onPress,
  accent,
}: {
  m: MatchCard;
  isLast: boolean;
  onPress: () => void;
  accent: string;
}) {
  const played = m.status === 'finished' || m.status === 'live';
  const hasScore = m.home.score != null && m.away.score != null;

  const pill = (() => {
    if (m.status === 'live') return <StatusPill status="live" minute={m.minute} />;
    if (m.status === 'finished') return <StatusPill status="ft" />;
    if (m.status === 'scheduled') return <StatusPill status="upcoming" time={formatTime(m.date)} />;
    return <StatusPill status="planned" />;
  })();

  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: theme.ink[100],
          gap: 8,
        }}
      >
        {/* Teams stacked, home above away */}
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 8 }}>
            <TeamCrest name={m.home.team.nameHe} logoUrl={m.home.team.logoUrl} size={20} radius={4} />
            <Text style={{ flexShrink: 1, color: theme.ink[900], fontSize: 13.5, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
              {m.home.team.nameHe}
            </Text>
          </View>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 8 }}>
            <TeamCrest name={m.away.team.nameHe} logoUrl={m.away.team.logoUrl} size={20} radius={4} />
            <Text style={{ flexShrink: 1, color: theme.ink[900], fontSize: 13.5, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
              {m.away.team.nameHe}
            </Text>
          </View>
        </View>

        {/* Score (played) — otherwise a dash */}
        <View style={{ alignItems: 'center', marginHorizontal: 4, minWidth: 22 }}>
          {played && hasScore ? (
            <>
              <Text style={{ fontSize: 17, fontWeight: '900', color: accent }}>{m.home.score}</Text>
              <Text style={{ fontSize: 17, fontWeight: '900', color: accent, marginTop: 2 }}>{m.away.score}</Text>
            </>
          ) : (
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink[300] }}>—</Text>
          )}
        </View>

        {/* Status + date */}
        <View style={{ alignItems: 'center', gap: 4, minWidth: 58 }}>
          {pill}
          <Text style={{ fontSize: 10, fontWeight: '600', color: theme.ink[500] }}>{formatDate(m.date)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function GamesScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { selectedYear } = useSeasonStore();
  const [competitionId, setCompetitionId] = useState<string | null>(null);

  // Reset the competition filter when the season changes — the chosen
  // competition may not exist in the newly-selected season.
  useEffect(() => {
    setCompetitionId(null);
  }, [selectedYear]);

  const { data, isLoading, refetch, isRefetching } = useGames(selectedYear, competitionId);

  const headerTitle = 'משחקים';
  const headerSubtitle = data?.season?.name ? `עונת ${data.season.name}` : undefined;
  const headerRight = <SeasonChip />;

  // Active competition tab: the server echoes the resolved default, so fall
  // back to it when the user hasn't picked one yet.
  const activeComp = competitionId ?? data?.selectedCompetitionId ?? '';

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
      <Header title={headerTitle} subtitle={headerSubtitle} rightSlot={headerRight} />

      {data && data.competitions.length > 1 ? (
        <TabBar
          items={data.competitions.map((c) => ({ id: c.id, label: c.nameHe }))}
          value={activeComp}
          onChange={(id) => setCompetitionId(id)}
        />
      ) : null}

      {!data || data.rounds.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 28 }}>⚽</Text>
          </View>
          <Text style={{ color: theme.ink[900], fontSize: 16, fontWeight: '800', textAlign: 'center' }}>
            אין משחקים לעונה זו
          </Text>
          <Text style={{ color: theme.ink[500], fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            נסו לבחור עונה או מסגרת אחרת.
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ paddingVertical: 16, gap: 8, paddingBottom: 32 }}
        >
          {data.rounds.map((group) => (
            <Section key={group.roundLabel} title={group.roundLabel} dense>
              <Card pad={false}>
                {group.games.map((m, i, arr) => (
                  <GameRow
                    key={m.id}
                    m={m}
                    isLast={i === arr.length - 1}
                    accent={brand.accent}
                    onPress={() => router.push(`/games/${m.id}` as any)}
                  />
                ))}
              </Card>
            </Section>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

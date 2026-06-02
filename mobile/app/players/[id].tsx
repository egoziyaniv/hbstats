import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { CachedImage } from '@/design-system/CachedImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlayer } from '@/hooks/usePlayer';
import { usePlayerMatchHistory } from '@/hooks/usePlayerMatchHistory';
import { PlayerMatchHistorySection } from '@/design-system/PlayerMatchHistorySection';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { PlayerTrophyCabinet } from '@/design-system/PlayerTrophyCabinet';
import { MetricCell } from '@/design-system/MetricCell';
import { BackButton } from '@/design-system/BackButton';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { PlayerCareerEntry } from '@shared/types/mobile-api';

const roleLabel: Record<'started' | 'subbed_in' | 'unused' | 'subbed_out', string> = {
  started: 'התחיל',
  subbed_in: 'נכנס',
  unused: 'ספסל',
  subbed_out: 'הוחלף',
};

function formatHebrewDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function calculateAge(iso: string | null): number | null {
  if (!iso) return null;
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = usePlayer(id);
  const { data: matchHistory } = usePlayerMatchHistory(id || null);
  const { brand } = useTheme();
  const insets = useSafeAreaInsets();

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const stats = data.currentSeasonStats;
  const age = calculateAge(data.player.dateOfBirth);
  const firstLetter = data.player.nameHe.slice(0, 1);

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32, paddingTop: insets.top + 8 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
    >
      {/* Hero header — purple→blue gradient with photo + name + team. */}
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 28, overflow: 'hidden' }}
      >
        <View className="px-6 py-6">
          {/* Back arrow on the right (RTL) */}
          <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginBottom: 12 }}>
            <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} />
            <View />
          </View>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 16 }}>
            {absoluteImage(data.player.photoUrl) ? (
              <CachedImage source={{ uri: absoluteImage(data.player.photoUrl) }} className="w-24 h-24 rounded-full border-2 border-white/30" />
            ) : (
              <View className="w-24 h-24 rounded-full bg-white/15 items-center justify-center border-2 border-white/30">
                <Text className="text-3xl font-black text-white">{firstLetter}</Text>
              </View>
            )}
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {data.player.position ? (
                <Text className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                  {data.player.position}
                </Text>
              ) : null}
              <Text className="mt-1 text-2xl font-black text-white">{data.player.nameHe}</Text>
              {data.currentTeam ? (
                <Pressable onPress={() => router.push(`/teams/${data.currentTeam!.id}` as any)}>
                  <Text className="mt-1 text-sm font-bold text-white/90 underline">
                    {data.currentTeam.nameHe}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          {(age !== null || data.player.marketValue || data.player.contractUntil) ? (
            <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {age !== null ? <Pill label={`גיל ${age}`} /> : null}
              {data.player.marketValue ? <Pill label={`שווי ${data.player.marketValue}`} /> : null}
              {data.player.contractUntil ? <Pill label={`חוזה ${formatHebrewDate(data.player.contractUntil)}`} /> : null}
              {data.player.nationality ? <Pill label={data.player.nationality} /> : null}
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {data.player.aiOverview && (data.player.aiOverview.text || data.player.aiOverview.wikiSummary) ? (
        <Card>
          <Section title="סקירה">
            {data.player.aiOverview.text ? (
              <View style={{ backgroundColor: '#FAFAF7', borderRadius: 12, padding: 12, marginBottom: data.player.aiOverview.wikiSummary ? 12 : 0 }}>
                <Text style={{ fontSize: 14, lineHeight: 21, color: '#222', textAlign: 'right' }}>
                  {data.player.aiOverview.text}
                </Text>
                <Text style={{ fontSize: 9, color: '#999', marginTop: 6, textAlign: 'right', fontWeight: '700', letterSpacing: 0.5 }}>
                  ניתוח AI
                </Text>
              </View>
            ) : null}
            {data.player.aiOverview.wikiSummary ? (
              <View style={{ flexDirection: rtlRow(), gap: 12 }}>
                {data.player.aiOverview.wikiThumbnail ? (
                  <CachedImage source={{ uri: data.player.aiOverview.wikiThumbnail }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                ) : null}
                <Text style={{ fontSize: 13, lineHeight: 19, color: '#555', textAlign: 'right', flex: 1 }}>
                  {data.player.aiOverview.wikiSummary}
                </Text>
              </View>
            ) : null}
          </Section>
        </Card>
      ) : null}

      {data.player.dateOfBirth ? (
        <Card>
          <Section title="פרטים אישיים">
            <View className="gap-2">
              <Row label="תאריך לידה" value={`${formatHebrewDate(data.player.dateOfBirth)}${age !== null ? `  (גיל ${age})` : ''}`} />
              {data.player.marketValue ? <Row label="שווי שוק" value={data.player.marketValue} accent /> : null}
              {data.player.contractUntil ? <Row label="חוזה עד" value={formatHebrewDate(data.player.contractUntil) ?? ''} /> : null}
              {data.player.nationality ? <Row label="לאום" value={data.player.nationality} /> : null}
            </View>
          </Section>
        </Card>
      ) : null}

      {stats ? (
        <Card>
          <Section title="סטטיסטיקות עונה">
            <View className="flex-row flex-wrap gap-2">
              <MetricCell value={stats.appearances} label="משחקים" />
              <MetricCell value={stats.goals} label="שערים" tone="accent" />
              <MetricCell value={stats.assists} label="בישולים" tone="accent" />
              <MetricCell value={stats.yellowCards} label="צהובים" />
              <MetricCell value={stats.redCards} label="אדומים" />
              <MetricCell value={`${Math.round(stats.minutes / 60)}h`} label="דקות" />
            </View>
          </Section>
        </Card>
      ) : null}

      {data.career.length > 0 ? (
        <Card>
          <Section title={`היסטוריית קריירה · ${data.career.length} עונות`}>
            <View className="-mx-1">
              {data.career.map((row, i) => (
                <CareerRow key={row.season + '-' + i} row={row} />
              ))}
            </View>
          </Section>
        </Card>
      ) : null}

      {data.trophies && data.trophies.length > 0 ? (
        <Section title="גביעים והישגים">
          <PlayerTrophyCabinet trophies={data.trophies} />
        </Section>
      ) : null}

      {matchHistory && matchHistory.entries.length > 0 ? (
        <Card>
          <Section title={`סטטיסטיקה פר-משחק · ${matchHistory.entries.length} אחרונים`}>
            <PlayerMatchHistorySection entries={matchHistory.entries} />
          </Section>
        </Card>
      ) : null}

      {data.recentMatches.length > 0 ? (
        <Card>
          <Section title="5 משחקים אחרונים">
            {data.recentMatches.map((m) => (
              <Pressable key={m.matchId} onPress={() => router.push(`/games/${m.matchId}` as any)}>
                <View className="py-3 border-b border-ink-100">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-bold text-ink-900">{m.opponent}</Text>
                    <View className="rounded-full bg-ink-100 px-2.5 py-1">
                      <Text className="text-[11px] font-bold text-ink-700">{roleLabel[m.role]}</Text>
                    </View>
                  </View>
                  {m.contribution.goals > 0 || m.contribution.assists > 0 ? (
                    <Text className="text-xs text-ink-500 mt-1">
                      {m.contribution.goals > 0 && `⚽ ${m.contribution.goals} `}
                      {m.contribution.assists > 0 && `🅰 ${m.contribution.assists}`}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Section>
        </Card>
      ) : null}
    </ScrollView>
    <BottomNav />
    </View>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-white/15 px-3 py-1.5 border border-white/20">
      <Text className="text-xs font-bold text-white">{label}</Text>
    </View>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-sm text-ink-500">{label}</Text>
      <Text className={`text-sm font-black ${accent ? 'text-accent' : 'text-ink-900'}`}>{value}</Text>
    </View>
  );
}

function CareerRow({ row }: { row: PlayerCareerEntry }) {
  return (
    <View className="rounded-lg px-2 py-2.5 border-b border-ink-100">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-sm font-black text-ink-900">{row.season}</Text>
        {row.competition ? (
          <Text className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">{row.competition}</Text>
        ) : null}
      </View>
      {row.team ? <Text className="text-xs text-ink-700 mt-0.5">{row.team}</Text> : null}
      <View className="flex-row gap-4 mt-2">
        {row.apps !== null ? <CareerStat label="הופעות" value={row.apps} /> : null}
        {row.goals !== null ? <CareerStat label="שערים" value={row.goals} /> : null}
        {row.assists !== null ? <CareerStat label="בישולים" value={row.assists} /> : null}
        {row.rating !== null ? <CareerStat label="ציון" value={row.rating.toFixed(1)} /> : null}
      </View>
    </View>
  );
}

function CareerStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="flex-row gap-1">
      <Text className="text-xs text-ink-500">{label}</Text>
      <Text className="text-xs font-black text-ink-900">{value}</Text>
    </View>
  );
}

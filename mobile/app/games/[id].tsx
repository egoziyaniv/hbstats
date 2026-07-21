import { useState } from 'react';
import { rtlRow } from '@/lib/rtl';
import { CachedImage } from '@/design-system/CachedImage';
import { TeamCrest } from '@/design-system/TeamCrest';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useMatch } from '@/hooks/useMatch';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { SofascoreMatchStatsPanel } from '@/design-system/SofascoreMatchStatsPanel';
import { LiveDot } from '@/design-system/LiveDot';
import { TabBar } from '@/design-system/TabBar';
import { BackButton } from '@/design-system/BackButton';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { PlayerMatchStatsSheet } from '@/design-system/PlayerMatchStatsSheet';
import { GameRatingSheet } from '@/design-system/GameRatingSheet';
import { useGamePlayerStats } from '@/hooks/useGamePlayerStats';
import type { MatchEvent, MatchPreviewApi, MatchPreviewFormItem, MatchPreviewSidelinedItem } from '@shared/types/mobile-api';

type MatchTabId = 'overview' | 'events' | 'stats' | 'lineups';

const EVENT_ICONS: Record<MatchEvent['type'], string> = {
  goal: '⚽',
  yellow: '🟨',
  red: '🟥',
  sub: '🔄',
  penalty: '🎯',
};

const STATUS_LABEL_HE: Record<string, string> = {
  finished: 'הסתיים',
  live: 'חי',
  scheduled: 'טרם החל',
  cancelled: 'בוטל',
  postponed: 'נדחה',
};

/**
 * Row layout: in RTL the HOME team is visually on the right and AWAY on the
 * left. We force flexDirection explicitly (Expo Go doesn't auto-flip flex
 * direction even when I18nManager.forceRTL is set) so the layout is correct
 * everywhere — home events read right-to-left, away events read left-to-right.
 */
function EventRow({ event }: { event: MatchEvent }) {
  // Home events read right→left (RTL flow), away events left→right.
  const flexDirection: 'row' | 'row-reverse' = event.team === 'home' ? rtlRow() : (rtlRow() === 'row-reverse' ? 'row' : 'row-reverse');
  const textAlign = event.team === 'home' ? 'right' : 'left';
  // Substitutions get rendered as "incoming → outgoing" (the API stores the
  // SUBSTITUTION_OUT row with the incoming player in relatedPlayer).
  const isSub = event.type === 'sub';
  const isGoal = event.type === 'goal';
  return (
    <View style={{ flexDirection, alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <View style={{ width: 36, alignItems: 'center' }}>
        <Text className="text-[11px] font-black text-ink-500">{event.minute}'</Text>
      </View>
      <Text className="text-lg">{EVENT_ICONS[event.type] ?? '•'}</Text>
      <View style={{ flex: 1 }}>
        {isSub && event.assistPlayer ? (
          <>
            <View style={{ flexDirection, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: theme.result.win }}>▲</Text>
              <Text className="text-sm font-bold text-ink-900" style={{ textAlign, flexShrink: 1 }} numberOfLines={1}>
                {event.assistPlayer}
              </Text>
            </View>
            <View style={{ flexDirection, alignItems: 'center', gap: 4, marginTop: 1 }}>
              <Text style={{ fontSize: 11, color: theme.result.loss }}>▼</Text>
              <Text className="text-xs text-ink-500" style={{ textAlign, flexShrink: 1 }} numberOfLines={1}>
                {event.player ?? '—'}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text className="text-sm font-bold text-ink-900" style={{ textAlign }} numberOfLines={1}>
              {event.player ?? '—'}
            </Text>
            {isGoal && event.assistPlayer ? (
              <Text className="text-[11px] text-ink-500" style={{ textAlign, marginTop: 1 }} numberOfLines={1}>
                בישול: {event.assistPlayer}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function StatRow({ label, home, away }: { label: string; home: string | number; away: string | number }) {
  // HOME value on the right (start in RTL), AWAY on the left — force row-reverse
  // so it always reads correctly regardless of Expo Go's RTL handling.
  return (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}>
      <Text style={{ width: 48, textAlign: 'right' }} className="text-sm font-black text-ink-900">{home}</Text>
      <Text className="flex-1 text-center text-[11px] font-semibold text-ink-500 uppercase tracking-wider">{label}</Text>
      <Text style={{ width: 48, textAlign: 'left' }} className="text-sm font-black text-ink-900">{away}</Text>
    </View>
  );
}

export default function MatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useMatch(id);
  const { brand } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MatchTabId>('overview');
  const [selectedPlayer, setSelectedPlayer] = useState<{ apiId: number | null; name: string; photo: string | null } | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const sheetOpen = selectedPlayer != null;
  const { data: playerStatsPayload, isLoading: playerStatsLoading } = useGamePlayerStats(id || null, sheetOpen);
  const selectedStats = selectedPlayer && playerStatsPayload
    ? playerStatsPayload.players.find((p) => p.apiFootballPlayerId === selectedPlayer.apiId) || null
    : null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  };

  if (isLoading || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas-start">
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const { match, homeTeam, awayTeam, events } = data;
  const isLive = match.status === 'live';

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      {/* Hero — match scoreline on brand gradient. Sits above the TabBar
          and stays in place while the tab content scrolls below. */}
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 8 }}
      >
        <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <BackButton onPress={goBack} />
            <View />
          </View>
          {/* HOME on the right, AWAY on the left — forced via row-reverse so
              the layout reads correctly in both RTL and Expo Go (which does
              not auto-flip flex-row). */}
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
            <View className="items-center flex-1">
              <TeamCrest name={homeTeam.nameHe} logoUrl={homeTeam.logoUrl} size={64} radius={8} bg="rgba(255,255,255,0.15)" fg="white" />
              <Text className="text-sm mt-2 text-center text-white font-bold" numberOfLines={2}>{homeTeam.nameHe}</Text>
            </View>
            <View className="items-center px-4">
              {isLive ? (
                <View className="flex-row items-center gap-1.5 mb-1">
                  <LiveDot />
                  <Text className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">LIVE</Text>
                </View>
              ) : null}
              {/* Deterministic RTL score: home first → renders on the right (matching
                  the home team column above), independent of bidi / isRTL. */}
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 6 }}>
                <Text className="text-4xl font-black text-white">{match.score.home ?? '-'}</Text>
                <Text className="text-4xl font-black text-white">–</Text>
                <Text className="text-4xl font-black text-white">{match.score.away ?? '-'}</Text>
              </View>
              <Text className="text-xs text-white/70 mt-1 font-semibold">
                {isLive ? `דקה ${match.minute ?? '-'}'` : (STATUS_LABEL_HE[match.status] ?? match.status)}
              </Text>
              {match.awarded ? (
                <View className="mt-2 px-2.5 py-1 rounded-full bg-amber-400/95">
                  <Text className="text-[10.5px] font-extrabold text-amber-950">{match.awarded.noteHe}</Text>
                </View>
              ) : null}
            </View>
            <View className="items-center flex-1">
              <TeamCrest name={awayTeam.nameHe} logoUrl={awayTeam.logoUrl} size={64} radius={8} bg="rgba(255,255,255,0.15)" fg="white" />
              <Text className="text-sm mt-2 text-center text-white font-bold" numberOfLines={2}>{awayTeam.nameHe}</Text>
            </View>
          </View>
          {match.venue ? (
            <View className="mt-4 self-center rounded-full bg-white/15 px-3 py-1.5 border border-white/20">
              <Text className="text-xs font-bold text-white">
                {match.venue.name}{match.venue.city ? ` · ${match.venue.city}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      <TabBar
        items={[
          { id: 'overview', label: 'סקירה' },
          { id: 'events',   label: 'אירועים' },
          { id: 'stats',    label: 'סטטיסטיקה' },
          { id: 'lineups',  label: 'הרכבים' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as MatchTabId)}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
      >
        {tab === 'overview' ? (
          <>
            {/* Pre-match preview — form + injuries/suspensions + AI, only for
                not-yet-started games (matches the web "לקראת המשחק" block). */}
            {data.preview ? (
              <PreMatchBlock
                preview={data.preview}
                homeName={homeTeam.nameHe}
                awayName={awayTeam.nameHe}
                onGamePress={(gid) => router.push(`/games/${gid}` as any)}
              />
            ) : null}
            {/* Top stats highlights */}
            {data.matchStats ? (
              <Card>
                <Section title="הסטטיסטיקה החשובה">
                  {data.matchStats.xg ? <StatRow label="שערים צפויים (xG)" home={data.matchStats.xg.home.toFixed(2)} away={data.matchStats.xg.away.toFixed(2)} /> : null}
                  {data.matchStats.possession ? <StatRow label="החזקה" home={`${data.matchStats.possession.home}%`} away={`${data.matchStats.possession.away}%`} /> : null}
                  {data.matchStats.shotsOnTarget ? <StatRow label="בעיטות למסגרת" home={data.matchStats.shotsOnTarget.home} away={data.matchStats.shotsOnTarget.away} /> : null}
                </Section>
              </Card>
            ) : null}
            {/* Goals only — full timeline lives in the Events tab */}
            {events.filter((e) => e.type === 'goal').length > 0 ? (
              <Card>
                <Section title="שערים">
                  {events.filter((e) => e.type === 'goal').map((e) => <EventRow key={e.id} event={e} />)}
                </Section>
              </Card>
            ) : null}
            {/* H2H summary */}
            {data.h2h && data.h2h.lastN.length > 0 ? (
              <Card>
                <Section title="היסטוריה ישירה">
                  <View style={{ flexDirection: rtlRow(), justifyContent: 'space-around', paddingVertical: 8 }}>
                    <View className="items-center flex-1">
                      <Text className="text-3xl font-black text-ink-900">{data.h2h.wins.home}</Text>
                      <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider" numberOfLines={1}>{homeTeam.nameHe}</Text>
                    </View>
                    <View className="items-center flex-1">
                      <Text className="text-3xl font-black text-ink-700">{data.h2h.wins.draw}</Text>
                      <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider">תיקו</Text>
                    </View>
                    <View className="items-center flex-1">
                      <Text className="text-3xl font-black text-ink-900">{data.h2h.wins.away}</Text>
                      <Text className="text-[11px] font-semibold text-ink-500 mt-1 uppercase tracking-wider" numberOfLines={1}>{awayTeam.nameHe}</Text>
                    </View>
                  </View>
                </Section>
              </Card>
            ) : null}
          </>
        ) : null}

        {tab === 'events' ? (
          events.length > 0 ? (
            <Card>
              {events.map((e) => <EventRow key={e.id} event={e} />)}
            </Card>
          ) : (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                אין אירועים זמינים למשחק זה.
              </Text>
            </Card>
          )
        ) : null}

        {tab === 'stats' ? (
          <>
            {data.matchStats ? (
              <Card>
                {data.matchStats.xg ? <StatRow label="שערים צפויים (xG)" home={data.matchStats.xg.home.toFixed(2)} away={data.matchStats.xg.away.toFixed(2)} /> : null}
                {data.matchStats.possession ? <StatRow label="החזקה" home={`${data.matchStats.possession.home}%`} away={`${data.matchStats.possession.away}%`} /> : null}
                {data.matchStats.shots ? <StatRow label="בעיטות" home={data.matchStats.shots.home} away={data.matchStats.shots.away} /> : null}
                {data.matchStats.shotsOnTarget ? <StatRow label="בעיטות למסגרת" home={data.matchStats.shotsOnTarget.home} away={data.matchStats.shotsOnTarget.away} /> : null}
                {data.matchStats.corners ? <StatRow label="קרנות" home={data.matchStats.corners.home} away={data.matchStats.corners.away} /> : null}
                {data.matchStats.fouls ? <StatRow label="עבירות" home={data.matchStats.fouls.home} away={data.matchStats.fouls.away} /> : null}
                {data.matchStats.offsides ? <StatRow label="נבדלים" home={data.matchStats.offsides.home} away={data.matchStats.offsides.away} /> : null}
                {data.matchStats.yellowCards ? <StatRow label="צהובים" home={data.matchStats.yellowCards.home} away={data.matchStats.yellowCards.away} /> : null}
                {data.matchStats.redCards ? <StatRow label="אדומים" home={data.matchStats.redCards.home} away={data.matchStats.redCards.away} /> : null}
              </Card>
            ) : (
              <Card>
                <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                  הסטטיסטיקה לא נטענה.
                </Text>
              </Card>
            )}
            {data.sofascoreStats && data.sofascoreStats.length > 0 ? (
              <Section title="סטטיסטיקה מפורטת — Sofascore">
                <SofascoreMatchStatsPanel stats={data.sofascoreStats} />
              </Section>
            ) : null}
          </>
        ) : null}

        {tab === 'lineups' && data.predicted && (data.predicted.home.length > 0 || data.predicted.away.length > 0) ? (
          <Card>
            <Section title="תחזית הרכב פותח" dense>
              <Text style={{ fontSize: 11, color: theme.ink[500], marginBottom: 8, textAlign: 'right' }}>
                לפי שכיחות הרכב פותח ב-5 משחקים אחרונים
              </Text>
              <View style={{ flexDirection: rtlRow(), gap: 12 }}>
                {[
                  { name: homeTeam.nameHe, list: data.predicted.home },
                  { name: awayTeam.nameHe, list: data.predicted.away },
                ].map((side) => (
                  <View key={side.name} style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', marginBottom: 4, textAlign: 'right' }}>{side.name}</Text>
                    {side.list.map((p) => {
                      const conf = p.totalGamesConsidered > 0 ? Math.round((p.startsInLast5 / p.totalGamesConsidered) * 100) : 0;
                      return (
                        <View key={p.playerId} style={{ flexDirection: rtlRow(), gap: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}>
                          <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
                            {p.jerseyNumber ? `${p.jerseyNumber}. ` : ''}{p.displayName}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: conf >= 80 ? '#047857' : conf >= 50 ? '#b45309' : theme.ink[500] }}>{conf}%</Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </Section>
          </Card>
        ) : null}

        {tab === 'lineups' && (data.lineups.home.players.length > 0 || data.lineups.away.players.length > 0) ? (
          <Pressable
            onPress={() => setRatingOpen(true)}
            style={{ marginBottom: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.accent, borderRadius: 12 }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>⭐ נקד את המשחק</Text>
          </Pressable>
        ) : null}

        {tab === 'lineups' ? (
          (data.lineups.home.players.length > 0 || data.lineups.away.players.length > 0) ? (
            <Card>
              <View style={{ flexDirection: rtlRow(), gap: 12 }}>
                <View className="flex-1">
                  <Text className="text-sm font-black text-ink-900">{homeTeam.nameHe}</Text>
                  {data.lineups.home.formation ? (
                    <Text className="text-[11px] font-semibold text-ink-500 mb-2 uppercase tracking-wider">
                      מערך {data.lineups.home.formation}
                    </Text>
                  ) : null}
                  {data.lineups.home.coach ? <CoachRow coach={data.lineups.home.coach} side="home" /> : null}
                  {data.lineups.home.players.filter((p) => p.isStarting).map((p) => (
                    <Pressable
                      key={p.player.id}
                      onPress={() => setSelectedPlayer({ apiId: p.player.apiId, name: p.player.nameHe, photo: p.player.photoUrl })}
                      style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}
                    >
                      <View className="w-7 h-7 rounded-full bg-ink-100 items-center justify-center">
                        <Text className="text-[11px] font-black text-ink-700">{p.player.jerseyNumber ?? '—'}</Text>
                      </View>
                      <Text style={{ flex: 1, textAlign: 'right' }} className="text-sm text-ink-900" numberOfLines={1}>{p.player.nameHe}</Text>
                      {p.rating != null ? <RatingBadge rating={p.rating} /> : null}
                    </Pressable>
                  ))}
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-black text-ink-900">{awayTeam.nameHe}</Text>
                  {data.lineups.away.formation ? (
                    <Text className="text-[11px] font-semibold text-ink-500 mb-2 uppercase tracking-wider">
                      מערך {data.lineups.away.formation}
                    </Text>
                  ) : null}
                  {data.lineups.away.coach ? <CoachRow coach={data.lineups.away.coach} side="away" /> : null}
                  {data.lineups.away.players.filter((p) => p.isStarting).map((p) => (
                    <Pressable
                      key={p.player.id}
                      onPress={() => setSelectedPlayer({ apiId: p.player.apiId, name: p.player.nameHe, photo: p.player.photoUrl })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}
                    >
                      <View className="w-7 h-7 rounded-full bg-ink-100 items-center justify-center">
                        <Text className="text-[11px] font-black text-ink-700">{p.player.jerseyNumber ?? '—'}</Text>
                      </View>
                      <Text style={{ flex: 1, textAlign: 'right' }} className="text-sm text-ink-900" numberOfLines={1}>{p.player.nameHe}</Text>
                      {p.rating != null ? <RatingBadge rating={p.rating} /> : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>
                ההרכבים לא נטענו.
              </Text>
            </Card>
          )
        ) : null}
      </ScrollView>
      <BottomNav />
      <PlayerMatchStatsSheet
        open={sheetOpen}
        onClose={() => setSelectedPlayer(null)}
        stats={selectedStats}
        loading={playerStatsLoading}
        playerLabel={selectedPlayer?.name ?? null}
        playerPhoto={selectedPlayer?.photo ?? null}
      />
      <GameRatingSheet
        visible={ratingOpen}
        onClose={() => setRatingOpen(false)}
        gameId={data.match.id}
        homeTeamName={homeTeam.nameHe}
        awayTeamName={awayTeam.nameHe}
        players={[
          ...data.lineups.home.players.map((p) => ({
            playerId: p.player.id,
            displayName: p.player.nameHe,
            photoUrl: p.player.photoUrl,
            jerseyNumber: p.player.jerseyNumber,
            position: p.player.position,
            side: 'home' as const,
          })),
          ...data.lineups.away.players.map((p) => ({
            playerId: p.player.id,
            displayName: p.player.nameHe,
            photoUrl: p.player.photoUrl,
            jerseyNumber: p.player.jerseyNumber,
            position: p.player.position,
            side: 'away' as const,
          })),
        ]}
      />
    </View>
  );
}

// Per-match Flashscore rating badge. Colour bands:
//   ≥ 8.0 green, 7.0-7.9 amber, 6.0-6.9 grey, < 6.0 red.
function RatingBadge({ rating }: { rating: number }) {
  const bg =
    rating >= 8.0 ? theme.result.win
    : rating >= 7.0 ? '#F59E0B'
    : rating >= 6.0 ? theme.ink[500]
    : theme.result.loss;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, minWidth: 32, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>{rating.toFixed(1)}</Text>
    </View>
  );
}

// ---------- Pre-match preview ("לקראת המשחק") ----------

const FORM_LETTER: Record<MatchPreviewFormItem['result'], string> = { W: 'נ', D: 'ת', L: 'ה' };
const formColor = (r: MatchPreviewFormItem['result']) =>
  r === 'W' ? theme.result.win : r === 'D' ? theme.result.draw : theme.result.loss;

function PreMatchForm({ items, onGamePress }: { items: MatchPreviewFormItem[]; onGamePress: (id: string) => void }) {
  if (!items.length) return <Text style={{ fontSize: 11, color: theme.ink[500], textAlign: 'right' }}>אין נתונים</Text>;
  // items are newest-first; rtlRow packs the first (newest) to the right.
  return (
    <View style={{ flexDirection: rtlRow(), gap: 4 }}>
      {items.map((f) => (
        <Pressable
          key={f.gameId}
          onPress={() => onGamePress(f.gameId)}
          style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: formColor(f.result), alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 12, fontWeight: '800' }}>{FORM_LETTER[f.result]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PreMatchSidelined({ items }: { items: MatchPreviewSidelinedItem[] }) {
  if (!items.length) return <Text style={{ fontSize: 11, color: theme.ink[500], textAlign: 'right' }}>אין נפקדים ידועים</Text>;
  return (
    <View style={{ gap: 4 }}>
      {items.map((s, i) => (
        <View key={i} style={{ flexDirection: rtlRow(), alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12 }}>{s.kind === 'suspension' ? '🟥' : '🩹'}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>{s.nameHe}</Text>
          <Text style={{ fontSize: 10.5, color: theme.ink[500], textAlign: 'right' }}>· {s.typeHe}</Text>
        </View>
      ))}
    </View>
  );
}

function PreMatchBlock({
  preview,
  homeName,
  awayName,
  onGamePress,
}: {
  preview: MatchPreviewApi;
  homeName: string;
  awayName: string;
  onGamePress: (id: string) => void;
}) {
  const sides = [
    { name: homeName, form: preview.form.home, out: preview.sidelined.home },
    { name: awayName, form: preview.form.away, out: preview.sidelined.away },
  ];
  return (
    <Card>
      <Section title="לקראת המשחק">
        {preview.aiSummary ? (
          <View style={{ backgroundColor: '#fffbeb', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }}>
              {preview.aiSummary}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: rtlRow(), gap: 12 }}>
          {sides.map((side) => (
            <View key={side.name} style={{ flex: 1, backgroundColor: theme.ink[50], borderRadius: 14, padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: theme.ink[900], textAlign: 'center', marginBottom: 8 }} numberOfLines={1}>
                {side.name}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'right', marginBottom: 4 }}>כושר אחרון</Text>
              <PreMatchForm items={side.form} onGamePress={onGamePress} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'right', marginTop: 10, marginBottom: 4 }}>נפקדים</Text>
              <PreMatchSidelined items={side.out} />
            </View>
          ))}
        </View>
      </Section>
    </Card>
  );
}

function CoachRow({ coach, side }: { coach: { id: string | null; name: string; nameHe: string | null; photoUrl: string | null }; side: 'home' | 'away' }) {
  const display = coach.nameHe || coach.name;
  return (
    <View
      style={{
        flexDirection: side === 'home' ? rtlRow() : 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        marginBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.ink[100],
      }}
    >
      {coach.photoUrl ? (
        <CachedImage source={{ uri: absoluteImage(coach.photoUrl) }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.ink[100] }} />
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: theme.ink[700] }}>
            {display.split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
      )}
      <Text style={{ flex: 1, textAlign: side === 'home' ? 'right' : 'left', fontSize: 12, color: theme.ink[700] }} numberOfLines={1}>
        מאמן: {display}
      </Text>
    </View>
  );
}

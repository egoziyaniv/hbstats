import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { absoluteImage } from '@/lib/config';
import { useTeamSeason } from '@/hooks/useTeamSeason';
import { useTheme } from '@/contexts/ThemeContext';
import { CachedImage } from '@/design-system/CachedImage';
import { TeamCrest } from '@/design-system/TeamCrest';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { MetricCell } from '@/design-system/MetricCell';
import { BackButton } from '@/design-system/BackButton';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type {
  SeasonControl, SeasonDuel, SeasonGameLine, SeasonPlayerLine, SeasonRecord,
} from '@shared/types/mobile-api';

const TIMING = ['1-15', '16-30', '31-45', '46-60', '61-75', '76-90+'];
const RESULT_BG: Record<SeasonGameLine['result'], string> = { W: '#10b981', D: '#d6d3d1', L: '#f43f5e' };
const RESULT_FG: Record<SeasonGameLine['result'], string> = { W: 'white', D: '#292524', L: 'white' };
const RESULT_HE: Record<SeasonGameLine['result'], string> = { W: 'נ', D: 'ת', L: 'ה' };
const CONCEDED = '#94a3b8';

const rec = (r: SeasonRecord) => `${r.wins}-${r.draws}-${r.losses}`;

function T({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[{ textAlign: 'right', writingDirection: 'rtl', color: theme.ink[900] }, style]}>{children}</Text>;
}

/** Our share of a stat as a split bar (club colour) against the opponents (grey). */
function DuelRow({ label, duel, unit = '' }: { label: string; duel: SeasonDuel; unit?: string }) {
  const { brand } = useTheme();
  if (duel.us === null || duel.them === null) return null;
  const share = (duel.us / (duel.us + duel.them || 1)) * 100;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: theme.ink[900] }}>{duel.us}{unit}</Text>
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.ink[500] }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink[500] }}>{duel.them}{unit}</Text>
      </View>
      <View style={{ height: 9, borderRadius: 999, backgroundColor: theme.ink[200], overflow: 'hidden', flexDirection: rtlRow() }}>
        <View style={{ width: `${share}%`, backgroundColor: brand.accent }} />
      </View>
    </View>
  );
}

function ControlCard({ title, c }: { title: string; c: SeasonControl }) {
  return (
    <Section title={title} dense>
      <Card>
        <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[500] }}>אנחנו</Text>
          <Text style={{ fontSize: 11, color: theme.ink[500] }}>ממוצע למשחק · {c.possession.games} משחקים</Text>
          <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[500] }}>יריבות</Text>
        </View>
        <DuelRow label="החזקת כדור" duel={c.possession} unit="%" />
        <DuelRow label="בעיטות" duel={c.shots} />
        <DuelRow label="בעיטות למסגרת" duel={c.shotsOnTarget} />
        <DuelRow label="הזדמנויות גדולות" duel={c.bigChances} />
        <DuelRow label="נגיעות ברחבה" duel={c.boxTouches} />
        <DuelRow label="xG" duel={c.xg} />
        {c.insight ? (
          <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 12, marginTop: 4 }}>
            <T style={{ color: '#78350f', fontSize: 13, fontWeight: '700', lineHeight: 20 }}>{c.insight}</T>
          </View>
        ) : null}
        <View style={{ flexDirection: rtlRow(), gap: 8, marginTop: 12 }}>
          <MetricCell value={c.conversion != null ? `${c.conversion}%` : '-'} label="ניצול בעיטות למסגרת" tone="accent" />
          <MetricCell value={c.savePct != null ? `${c.savePct}%` : '-'} label="הצלות" />
        </View>
      </Card>
    </Section>
  );
}

/** Goals for vs against per quarter-hour. Time runs left→right like any clock-face axis. */
function TimingChart({ scored, conceded }: { scored: number[]; conceded: number[] }) {
  const { brand } = useTheme();
  const max = Math.max(1, ...scored, ...conceded);
  const H = 120;
  return (
    <View>
      <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'flex-end', height: H, gap: 6 }}>
        {TIMING.map((b, i) => (
          <View key={b} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
            <View style={{ width: 11, height: (scored[i] / max) * H, minHeight: scored[i] ? 4 : 0, backgroundColor: brand.accent, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
            <View style={{ width: 11, height: (conceded[i] / max) * H, minHeight: conceded[i] ? 4 : 0, backgroundColor: CONCEDED, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', direction: 'ltr', marginTop: 6 }}>
        {TIMING.map((b, i) => (
          <View key={b} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: theme.ink[500] }}>{b}</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: theme.ink[700] }}>{scored[i]}:{conceded[i]}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: rtlRow(), gap: 14, marginTop: 10 }}>
        <Legend color={brand.accent} label="זכות" />
        <Legend color={CONCEDED} label="חובה" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11.5, color: theme.ink[700] }}>{label}</Text>
    </View>
  );
}

/** League points after each game against the pace of winning every one (dashed). */
function PointsChart({ points }: { points: Array<{ n: number; points: number }> }) {
  const { brand } = useTheme();
  const W = 300, H = 140, pad = 14;
  const n = points.length;
  const maxPts = Math.max(3 * n, 3);
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / maxPts) * (H - 2 * pad);
  const line = points.map((p, i) => `${x(i)},${y(p.points)}`).join(' ');
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={x(0)} y1={y(3)} x2={x(n - 1)} y2={y(3 * n)} stroke={theme.ink[300]} strokeDasharray="5,5" strokeWidth={1.5} />
        <Polyline points={line} fill="none" stroke={brand.accent} strokeWidth={3} />
        {points.map((p, i) => <Circle key={p.n} cx={x(i)} cy={y(p.points)} r={4} fill={brand.accent} />)}
      </Svg>
      <View style={{ flexDirection: rtlRow(), gap: 14 }}>
        <Legend color={brand.accent} label={`נקודות (${points[n - 1]?.points ?? 0})`} />
        <Legend color={theme.ink[300]} label={`מקסימום אפשרי (${3 * n})`} />
      </View>
    </View>
  );
}

function GameChip({ g, onPress }: { g: SeasonGameLine; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: RESULT_BG[g.result], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: RESULT_FG[g.result], fontSize: 11.5, fontWeight: '800' }}>{g.goalsFor}-{g.goalsAgainst} {g.opponentName}</Text>
    </Pressable>
  );
}

function PlayerRows({ rows, unit, empty, onPress }: { rows: SeasonPlayerLine[]; unit: string; empty: string; onPress: (id: string) => void }) {
  const { brand } = useTheme();
  if (!rows.length) return <T style={{ color: theme.ink[500], fontSize: 13 }}>{empty}</T>;
  return (
    <View>
      {rows.slice(0, 5).map((r, i, arr) => (
        <Pressable key={r.playerId} onPress={() => onPress(r.playerId)}
          style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: theme.ink[100] }}>
          <Text style={{ width: 16, fontSize: 12, fontWeight: '900', color: theme.ink[500] }}>{i + 1}</Text>
          {absoluteImage(r.photoUrl) ? (
            <CachedImage source={{ uri: absoluteImage(r.photoUrl) }} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: theme.ink[200] }} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: brand.accent, fontWeight: '900' }}>{r.name.slice(0, 1)}</Text>
            </View>
          )}
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900] }} numberOfLines={1}>{r.name}</Text>
            <Text style={{ fontSize: 11.5, color: theme.ink[500] }}>{r.games} משחקים{r.detail ? ` · ${r.detail}` : ''}</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: brand.accent }}>{r.value}</Text>
          <Text style={{ fontSize: 10.5, color: theme.ink[500], width: 40 }}>{unit}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function TeamSeasonScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  const { data: s, isLoading, refetch, isRefetching } = useTeamSeason(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as any));
  const openGame = (gid: string) => router.push(`/games/${gid}` as any);
  const openPlayer = (pid: string) => router.push(`/players/${pid}` as any);

  if (isLoading || !s) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const conceded = s.timing.conceded.reduce((a, b) => a + b, 0);
  const late = s.timing.conceded[5];
  const scoredFirst = s.lines.filter((l) => l.firstGoal === 'us');
  const concededFirst = s.lines.filter((l) => l.firstGoal === 'them');
  const wdl = (ls: SeasonGameLine[]) =>
    `${ls.filter((l) => l.result === 'W').length}-${ls.filter((l) => l.result === 'D').length}-${ls.filter((l) => l.result === 'L').length}`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
      >
        <LinearGradient colors={[brand.accent, brand.accentDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 20 }}>
          <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginBottom: 14 }}>
            <BackButton onPress={goBack} />
            <View />
          </View>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 14 }}>
            <TeamCrest name={s.team.nameHe} logoUrl={s.team.logoUrl} size={60} radius={12} bg="rgba(255,255,255,0.15)" fg="white" />
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' }}>תמונת עונה · {s.seasonName}</Text>
              <Text style={{ color: 'white', fontSize: 23, fontWeight: '900' }}>{s.team.nameHe}</Text>
              {s.standing ? (
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12.5, marginTop: 3, textAlign: 'right' }}>
                  מקום {s.standing.position} · {s.standing.points} נק׳
                  {s.standing.leaderName ? ` · ${s.standing.gapToLeader} מאחורי ${s.standing.leaderName}` : ' · בראש הטבלה'}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 5, marginTop: 14 }}>
            {s.lines.map((g) => (
              <Pressable key={g.id} onPress={() => openGame(g.id)}
                style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: RESULT_BG[g.result], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: RESULT_FG[g.result], fontSize: 11, fontWeight: '900' }}>{RESULT_HE[g.result]}</Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>

        <Section title="מאזן העונה" dense>
          <Card pad={false}>
            <View style={{ flexDirection: rtlRow(), padding: 14, gap: 8 }}>
              <MetricCell value={rec(s.competitive)} label="נ-ת-ה" tone="accent" />
              <MetricCell value={`${s.competitive.goalsFor}:${s.competitive.goalsAgainst}`} label="שערים" />
              <MetricCell value={s.competitive.cleanSheets} label="רשת נקייה" />
            </View>
            {s.leagueHome && s.leagueAway ? (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.ink[100], padding: 12 }}>
                <T style={{ fontSize: 12.5, color: theme.ink[700] }}>
                  {s.leagueName}: בבית {rec(s.leagueHome)} ({s.leagueHome.goalsFor}:{s.leagueHome.goalsAgainst}) · בחוץ {rec(s.leagueAway)} ({s.leagueAway.goalsFor}:{s.leagueAway.goalsAgainst})
                </T>
              </View>
            ) : null}
          </Card>
        </Section>

        <Section title="לפי מסגרת" dense>
          <Card pad={false}>
            {s.byCompetition.map((c, i, arr) => (
              <View key={c.id} style={{ flexDirection: rtlRow(), alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: theme.ink[100] }}>
                <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '800', color: theme.ink[900], textAlign: 'right' }}>{c.name}</Text>
                <Text style={{ width: 56, fontSize: 13, fontWeight: '700', color: theme.ink[700], textAlign: 'center' }}>{rec(c.record)}</Text>
                <Text style={{ width: 48, fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>{c.record.goalsFor}:{c.record.goalsAgainst}</Text>
              </View>
            ))}
          </Card>
        </Section>

        {s.leagueControl ? <ControlCard title={`שליטה מול איכות — ${s.leagueName}`} c={s.leagueControl} /> : null}
        {s.europeControl ? <ControlCard title="שליטה מול איכות — אירופה" c={s.europeControl} /> : null}

        <Section title="מתי השערים נופלים" dense>
          <Card>
            <TimingChart scored={s.timing.scored} conceded={s.timing.conceded} />
            {conceded >= 5 && late / conceded >= 0.3 ? (
              <T style={{ color: '#be123c', fontSize: 13, fontWeight: '700', marginTop: 10 }}>
                {late} מתוך {conceded} שערי החובה ({Math.round((100 * late) / conceded)}%) נספגו מהדקה ה-76.
              </T>
            ) : null}
          </Card>
        </Section>

        {s.leaguePoints.length > 1 ? (
          <Section title={`צבירת נקודות — ${s.leagueName}`} dense>
            <Card><PointsChart points={s.leaguePoints} /></Card>
          </Section>
        ) : null}

        <Section title="השער הראשון" dense>
          <Card>
            {[{ t: 'כשכובשת ראשונה', ls: scoredFirst }, { t: 'כשסופגת ראשונה', ls: concededFirst }].map(({ t, ls }, idx) => (
              <View key={t} style={{ marginTop: idx ? 14 : 0 }}>
                <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink[500] }}>{t}</Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: theme.ink[900] }}>{ls.length ? wdl(ls) : '-'}</Text>
                </View>
                <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {ls.map((g) => <GameChip key={g.id} g={g} onPress={() => openGame(g.id)} />)}
                </View>
              </View>
            ))}
          </Card>
        </Section>

        <Section title="כובשים" dense>
          <Card><PlayerRows rows={s.scorers} unit="שערים" empty="אין עדיין שערים משויכים." onPress={openPlayer} /></Card>
        </Section>
        <Section title="מבשלים" dense>
          <Card><PlayerRows rows={s.assisters} unit="בישולים" empty="אין עדיין בישולים משויכים." onPress={openPlayer} /></Card>
        </Section>
        <Section title="ציון ממוצע (FotMob)" dense>
          <Card><PlayerRows rows={s.ratings} unit="ציון" empty="אין מספיק משחקים מדורגים." onPress={openPlayer} /></Card>
        </Section>

        <Section title="המשחקים" dense>
          <Card pad={false}>
            {[...s.lines].reverse().map((g, i, arr) => (
              <Pressable key={g.id} onPress={() => openGame(g.id)}
                style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: theme.ink[100] }}>
                <TeamCrest name={g.opponentName} logoUrl={g.opponentLogo} size={26} radius={6} />
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.ink[900] }} numberOfLines={1}>{g.home ? 'נגד' : 'אצל'} {g.opponentName}</Text>
                  <Text style={{ fontSize: 11, color: theme.ink[500] }}>{g.date} · {g.competitionName}</Text>
                </View>
                <View style={{ backgroundColor: RESULT_BG[g.result], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: RESULT_FG[g.result], fontSize: 12, fontWeight: '900' }}>{g.goalsFor}-{g.goalsAgainst}</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </Section>
      </ScrollView>
      <BottomNav />
    </View>
  );
}

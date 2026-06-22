import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { CachedImage } from '@/design-system/CachedImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTeam } from '@/hooks/useTeam';
import { useTeamExtras } from '@/hooks/useTeamExtras';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { MetricCell } from '@/design-system/MetricCell';
import { FormRow } from '@/design-system/FormPill';
import { BackButton } from '@/design-system/BackButton';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';

// Map the API's English form letters → Hebrew letters so FormPill colors right.
const FORM_HE: Record<string, string> = { W: 'נ', D: 'ת', L: 'ה' };

export default function TeamScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useTeam(id);
  const { data: extras } = useTeamExtras(id || null);
  const { brand } = useTheme();
  const insets = useSafeAreaInsets();

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as any));
  const formHe = data.recentForm.map((r) => FORM_HE[r] || 'ת').join('');

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
    >
      {/* Hero header */}
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 24 }}
      >
        {/* Top row: back arrow on the right */}
        <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginBottom: 16 }}>
          <BackButton onPress={goBack} />
          <View />
        </View>

        <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 16 }}>
          {absoluteImage(data.team.logoUrl) ? (
            <CachedImage source={{ uri: absoluteImage(data.team.logoUrl) }} style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>{data.team.nameHe.slice(0, 1)}</Text>
            </View>
          )}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'right' }}>{data.team.nameHe}</Text>
            {data.team.city ? (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, textAlign: 'right' }}>{data.team.city}</Text>
            ) : null}
            {data.coach ? (
              <View style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>מאמן: {data.coach.name}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      {/* AI / Wikipedia overview */}
      {data.team.aiSummaryText || data.team.wikiSummary ? (
        <Section title="סקירה" dense>
          <Card>
            {data.team.aiSummaryText ? (
              <View style={{ backgroundColor: '#FAFAF7', borderRadius: 12, padding: 12, marginBottom: data.team.wikiSummary ? 12 : 0 }}>
                <Text style={{ fontSize: 14, lineHeight: 21, color: '#222', textAlign: 'right' }}>
                  {data.team.aiSummaryText}
                </Text>
                <Text style={{ fontSize: 9, color: '#999', marginTop: 6, textAlign: 'right', fontWeight: '700', letterSpacing: 0.5 }}>
                  ניתוח AI
                </Text>
              </View>
            ) : null}
            {data.team.wikiSummary ? (
              <View style={{ flexDirection: rtlRow(), gap: 12 }}>
                {data.team.wikiThumbnail ? (
                  <CachedImage source={{ uri: data.team.wikiThumbnail }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                ) : null}
                <Text style={{ fontSize: 13, lineHeight: 19, color: '#555', textAlign: 'right', flex: 1 }}>
                  {data.team.wikiSummary}
                </Text>
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {/* Recent form */}
      {data.recentForm.length > 0 ? (
        <Section title="צורה אחרונה" dense>
          <Card>
            <View style={{ flexDirection: rtlRow(), justifyContent: 'flex-start' }}>
              <FormRow form={formHe} size={26} gap={6} />
            </View>
          </Card>
        </Section>
      ) : null}

      {/* Season stats grid */}
      <Section title="סטטיסטיקות עונה" dense>
        <Card pad={false}>
          <View style={{ flexDirection: rtlRow(), padding: 14, gap: 8 }}>
            <MetricCell value={data.seasonStats.goalsScored} label="שערים בעד" tone="accent" />
            <MetricCell value={data.seasonStats.goalsAgainst} label="שערים נגד" />
            <MetricCell value={data.seasonStats.cleanSheets} label="רשת נקייה" />
          </View>
        </Card>
      </Section>

      {/* Standings context */}
      {data.standingsContext ? (
        <Section title={`מקום ${data.standingsContext.rank} · ${data.standingsContext.points} נק'`} dense>
          <Card pad={false}>
            {data.standingsContext.around.map((row, i, arr) => {
              const isSelf = row.team.id === data.team.id;
              return (
                <View
                  key={row.rank}
                  style={{
                    flexDirection: rtlRow(),
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                    borderBottomColor: theme.ink[100],
                    backgroundColor: isSelf ? brand.accentGlow : 'transparent',
                  }}
                >
                  <Text style={{ width: 22, fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>
                    {row.rank}
                  </Text>
                  <Text style={{ flex: 1, marginStart: 10, marginEnd: 10, fontSize: 13.5, fontWeight: isSelf ? '800' : '600', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                    {row.team.nameHe}
                  </Text>
                  <View style={{ backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, minWidth: 30 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>
                      {row.points}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {data.nextMatch ? (
        <Section title="המשחק הבא" dense>
          <Card>
            <Pressable onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)}>
              <MatchPreviewRow match={data.nextMatch} />
            </Pressable>
          </Card>
        </Section>
      ) : null}
      {data.lastMatch ? (
        <Section title="המשחק האחרון" dense>
          <Card>
            <Pressable onPress={() => router.push(`/games/${data.lastMatch!.id}` as any)}>
              <MatchPreviewRow match={data.lastMatch} />
            </Pressable>
          </Card>
        </Section>
      ) : null}

      {/* Squad */}
      {data.squad.length > 0 ? (
        <Section title="סגל" dense>
          <Card pad={false}>
            {data.squad.map((group, gi) => (
              <View key={group.position} style={{ borderTopWidth: gi === 0 ? 0 : 1, borderTopColor: theme.ink[100] }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.ink[50] }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[700], textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {group.position}
                  </Text>
                </View>
                {group.players.map((p, pi) => (
                  <Pressable key={p.id} onPress={() => router.push(`/players/${p.id}` as any)}>
                    <View
                      style={{
                        flexDirection: rtlRow(),
                        alignItems: 'center',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderBottomWidth: pi === group.players.length - 1 ? 0 : 1,
                        borderBottomColor: theme.ink[100],
                      }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[700] }}>{p.jerseyNumber ?? '—'}</Text>
                      </View>
                      <Text style={{ flex: 1, marginHorizontal: 10, fontSize: 14, color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                        {p.nameHe}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {extras && extras.coachChart && extras.coachChart.length > 0 ? (
        <Section title="היסטוריית מאמנים — אחוז ניצחונות">
          <Card pad={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 16 }}>
              {extras.coachChart.map((e, i) => {
                const initials = e.displayName.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
                const barHeight = Math.max(20, Math.min(120, (e.pointsPerGame / 3) * 120));
                return (
                  <View key={`${e.coachKey}-${e.seasonName}-${i}`} style={{ alignItems: 'center', width: 72 }}>
                    <View style={{ backgroundColor: '#dc2626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: 'white' }}>{e.winPct}%</Text>
                    </View>
                    <View style={{ width: 36, height: barHeight, backgroundColor: '#dc2626', borderRadius: 4 }} />
                    <View style={{ backgroundColor: 'black', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginTop: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: 'white' }}>{e.pointsPerGame.toFixed(1)} Pts</Text>
                    </View>
                    <View style={{ marginTop: 6, alignItems: 'center' }}>
                      {e.photoUrl ? (
                        <CachedImage source={{ uri: e.photoUrl }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100] }} />
                      ) : (
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: theme.ink[500] }}>{initials}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 10, fontWeight: '800', textAlign: 'center', marginTop: 2 }} numberOfLines={1}>{e.displayName.split(' ').slice(-1)[0]}</Text>
                      <Text style={{ fontSize: 9, color: theme.ink[500] }}>{e.seasonName}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </Card>
        </Section>
      ) : null}

      {extras && extras.goalTiming && extras.goalTiming.length > 0 ? (
        <Section title="תזמון שערים">
          <Card>
            <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', gap: 6 }}>
              {extras.goalTiming.map((b) => {
                const maxV = Math.max(...extras.goalTiming!.map((x) => Math.max(x.scored, x.conceded)), 1);
                const sh = (b.scored / maxV) * 64;
                const ch = (b.conceded / maxV) * 64;
                return (
                  <View key={b.label} style={{ alignItems: 'center', flex: 1 }}>
                    <View style={{ height: 64, width: '100%', justifyContent: 'flex-end' }}>
                      <View style={{ height: sh, backgroundColor: '#10b981', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.ink[700] }}>{b.scored}</Text>
                    <View style={{ height: 1, width: '100%', backgroundColor: theme.ink[200], marginVertical: 2 }} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.ink[700] }}>{b.conceded}</Text>
                    <View style={{ height: 64, width: '100%' }}>
                      <View style={{ height: ch, backgroundColor: '#ef4444', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
                    </View>
                    <Text style={{ fontSize: 9, color: theme.ink[500], marginTop: 4 }}>{b.label}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: rtlRow(), justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: '#10b981', borderRadius: 2 }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[700] }}>כבושים</Text>
              </View>
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: '#ef4444', borderRadius: 2 }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[700] }}>ספוגים</Text>
              </View>
            </View>
          </Card>
        </Section>
      ) : null}

      {extras && extras.coachTimeline.length > 0 ? (
        <Section title="היסטוריית מאמנים — פר עונה">
          <Card>
            <View style={{ gap: 12 }}>
              {extras.coachTimeline.map((group) => (
                <View key={group.seasonId}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: theme.ink[900], marginBottom: 6 }}>{group.seasonName}</Text>
                  <View style={{ gap: 6 }}>
                    {group.coaches.map((c) => {
                      const initials = c.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
                      const wPct = c.matches > 0 ? (c.wins / c.matches) * 100 : 0;
                      const dPct = c.matches > 0 ? (c.draws / c.matches) * 100 : 0;
                      const lPct = c.matches > 0 ? (c.losses / c.matches) * 100 : 0;
                      return (
                        <View key={c.name + c.firstMatch} style={{ borderWidth: 1, borderColor: theme.ink[200], borderRadius: 10, padding: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {c.photoUrl ? (
                              <CachedImage source={{ uri: c.photoUrl }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100] }} />
                            ) : (
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontWeight: '900', color: theme.ink[500] }}>{initials || '?'}</Text>
                              </View>
                            )}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink[900] }} numberOfLines={1}>{c.name}</Text>
                              <Text style={{ fontSize: 10, color: theme.ink[500] }}>{c.firstMatch} → {c.lastMatch}</Text>
                            </View>
                            <Text style={{ fontSize: 11, color: theme.ink[700], fontWeight: '700' }}>{c.matches}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#047857', backgroundColor: '#d1fae5', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>נ' {c.wins}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: theme.ink[700], backgroundColor: theme.ink[100], paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>ת' {c.draws}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#b91c1c', backgroundColor: '#fee2e2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>ה' {c.losses}</Text>
                            <Text style={{ fontSize: 9, color: theme.ink[500], marginRight: 'auto' }}>{c.winPct}%</Text>
                          </View>
                          <View style={{ flexDirection: 'row', height: 4, marginTop: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.ink[100] }}>
                            <View style={{ width: `${wPct}%`, backgroundColor: '#10b981' }} />
                            <View style={{ width: `${dPct}%`, backgroundColor: '#a8a29e' }} />
                            <View style={{ width: `${lPct}%`, backgroundColor: '#ef4444' }} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {extras && extras.injuries.length > 0 ? (
        <Section title="פציעות אחרונות">
          <Card>
            <View style={{ gap: 4 }}>
              {extras.injuries.map((inj) => (
                <View key={inj.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink[900] }}>{inj.playerName || '—'}</Text>
                    <Text style={{ fontSize: 10, color: theme.ink[500] }}>{inj.reason || 'פציעה'}</Text>
                  </View>
                  {inj.date ? <Text style={{ fontSize: 10, color: theme.ink[500] }}>{inj.date}</Text> : null}
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}
    </ScrollView>
    <BottomNav />
    </View>
  );
}

function MatchPreviewRow({ match }: { match: {
  home: { team: { nameHe: string }; score: number | null };
  away: { team: { nameHe: string }; score: number | null };
  date: string;
  status: string;
} }) {
  const d = new Date(match.date);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center' }}>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
        {match.home.team.nameHe}
      </Text>
      <View style={{ marginHorizontal: 12, alignItems: 'center' }}>
        {match.status === 'finished' ? (
          // Deterministic RTL score: home first → renders on the right via rtlRow().
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink[900] }}>{match.home.score}</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink[900] }}>–</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink[900] }}>{match.away.score}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 13, color: theme.ink[500] }}>{time}</Text>
        )}
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'left' }} numberOfLines={1}>
        {match.away.team.nameHe}
      </Text>
    </View>
  );
}

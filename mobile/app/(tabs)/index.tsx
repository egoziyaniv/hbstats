import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { openExternalUrl } from '@/lib/openExternal';
import { CachedImage } from '@/design-system/CachedImage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useHome } from '@/hooks/useHome';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { TeamCrest } from '@/design-system/TeamCrest';
import { StatusPill } from '@/design-system/StatusPill';
import { FormRow } from '@/design-system/FormPill';
import { theme } from '@/design-system/theme';
import type { MatchCard } from '@shared/types/common';

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useHome();
  const { brand } = useTheme();

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.canvas.start }}>
        <Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center' }}>
          לא הצלחנו לטעון את הדף. נסה שוב מאוחר יותר.
        </Text>
      </View>
    );
  }

  // Featured: prefer the first live game, fall back to nextMatch.
  const liveFeature = data.liveStrip[0] ?? null;
  const fav = data.favoriteTeam;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Featured match hero — brand gradient like the prototype */}
        {liveFeature ? (
          <LiveFeatureHero match={liveFeature} accentStart={brand.accent} accentEnd={brand.accentDeep} onPress={() => router.push(`/games/${liveFeature.id}` as any)} />
        ) : data.nextMatch ? (
          <UpcomingFeatureHero match={data.nextMatch} accentStart={brand.accent} accentEnd={brand.accentDeep} onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)} />
        ) : null}

        <View style={{ height: 16 }} />

        {/* Favourite team chip */}
        {fav ? (
          <Section title="המועדפת שלך">
            <Pressable onPress={() => router.push(`/teams/${fav.id}` as any)}>
              <Card>
                <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 12 }}>
                  <TeamCrest mono={fav.nameHe.slice(0, 2)} bg={brand.accent} fg="white" size={36} logoUrl={fav.logoUrl} />
                  <Text style={{ flex: 1, color: theme.ink[900], fontSize: 16, fontWeight: '800', textAlign: 'right' }}>
                    {fav.nameHe}
                  </Text>
                  <Text style={{ color: brand.accent, fontSize: 12, fontWeight: '700' }}>← לדף הקבוצה</Text>
                </View>
              </Card>
            </Pressable>
          </Section>
        ) : null}

        {/* Live strip — show secondary live games */}
        {data.liveStrip.length > 1 ? (
          <Section title="גם משחקים חיים">
            <Card pad={false}>
              {data.liveStrip.slice(1).map((m, i, arr) => (
                <Pressable key={m.id} onPress={() => router.push(`/games/${m.id}` as any)}>
                  <View
                    style={{
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                      borderBottomColor: theme.ink[100],
                      flexDirection: rtlRow(),
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                      {m.home.name} — {m.away.name}
                    </Text>
                    <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: brand.accent }}>{m.home.score ?? '-'}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: brand.accent }}>:</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: brand.accent }}>{m.away.score ?? '-'}</Text>
                    </View>
                    <StatusPill status="live" minute={m.minute} />
                  </View>
                </Pressable>
              ))}
            </Card>
          </Section>
        ) : null}

        {/* Standings preview — mirrors the full standings screen layout
            (logo + GD + form row), capped at 5 rows. */}
        {data.compactStandings.length > 0 ? (
          <Section title="טבלת ליגת העל" actionLabel="טבלה מלאה" onAction={() => router.push('/(tabs)/standings' as any)}>
            <Card pad={false}>
              <View
                style={{
                  flexDirection: rtlRow(),
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  backgroundColor: theme.ink[50],
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                }}
              >
                <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>#</Text>
                <View style={{ width: 22, marginStart: 10, marginEnd: 8 }} />
                <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>קבוצה</Text>
                <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>מ'</Text>
                <Text style={{ width: 36, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>הפרש</Text>
                <Text style={{ width: 32, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>נק'</Text>
              </View>
              {data.compactStandings.slice(0, 5).map((row, i, arr) => (
                <Pressable key={row.teamId} onPress={() => router.push(`/teams/${row.teamId}` as any)}>
                  <View
                    style={{
                      flexDirection: rtlRow(),
                      alignItems: 'center',
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderBottomWidth: i === arr.length - 1 && !row.form ? 0 : 1,
                      borderBottomColor: theme.ink[100],
                    }}
                  >
                    <Text style={{ width: 24, fontSize: 13, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>
                      {row.rank}
                    </Text>
                    {absoluteImage(row.logoUrl) ? (
                      <CachedImage source={{ uri: absoluteImage(row.logoUrl) }} style={{ width: 22, height: 22, borderRadius: 4, marginStart: 10, marginEnd: 8 }} />
                    ) : (
                      <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: theme.ink[200], marginStart: 10, marginEnd: 8 }} />
                    )}
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                      {row.teamName}
                    </Text>
                    <Text style={{ width: 24, fontSize: 11, color: theme.ink[500], textAlign: 'center' }}>{row.played}</Text>
                    <Text style={{ width: 36, fontSize: 11, fontWeight: '600', color: row.goalsDiff > 0 ? theme.result.win : row.goalsDiff < 0 ? theme.result.loss : theme.ink[500], textAlign: 'center' }}>
                      {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                    </Text>
                    <View style={{ width: 32, backgroundColor: brand.accentGlow, borderRadius: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>
                        {row.points}
                      </Text>
                    </View>
                  </View>
                  {row.form ? (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 8, flexDirection: rtlRow(), justifyContent: 'flex-end' }}>
                      <FormRow form={row.form} size={16} gap={3} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </Card>
          </Section>
        ) : null}

        {/* Next & last match cards */}
        {data.nextMatch && !liveFeature ? null : data.nextMatch ? (
          <Section title="המשחק הבא">
            <MatchPreviewRow match={data.nextMatch} onPress={() => router.push(`/games/${data.nextMatch!.id}` as any)} brandAccent={brand.accent} />
          </Section>
        ) : null}

        {data.lastMatch ? (
          <Section title="המשחק האחרון">
            <MatchPreviewRow match={data.lastMatch} onPress={() => router.push(`/games/${data.lastMatch!.id}` as any)} brandAccent={brand.accent} />
          </Section>
        ) : null}

        {/* Predictions teaser */}
        <Section title="תחזיות משחק" actionLabel="כל התחזיות" onAction={() => router.push('/predictions' as any)}>
          <Card>
            <Text style={{ color: theme.ink[700], fontSize: 13, textAlign: 'right', writingDirection: 'rtl' }}>
              לחץ "כל התחזיות" כדי לראות אחוזי ניצחון, המלצות הימור והערכות לכל המשחקים הקרובים.
            </Text>
          </Card>
        </Section>

        {/* News strip */}
        {data.newsStrip.length > 0 ? (
          <Section title="חדשות" actionLabel="כל החדשות" onAction={() => router.push('/news' as any)}>
            <Card pad={false}>
              {data.newsStrip.slice(0, 5).map((n, i, arr) => {
                const formattedDate = (() => {
                  if (!n.publishedAt) return null;
                  const d = new Date(n.publishedAt);
                  if (Number.isNaN(d.getTime())) return null;
                  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                })();
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => openExternalUrl(n.url)}
                  >
                    <View
                      style={{
                        flexDirection: rtlRow(),
                        gap: 12,
                        padding: 12,
                        borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                        borderBottomColor: theme.ink[100],
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ color: theme.ink[900], fontSize: 13.5, lineHeight: 19, textAlign: 'right', writingDirection: 'rtl' }}
                          numberOfLines={3}
                        >
                          {n.preview}
                        </Text>
                        <View style={{ flexDirection: rtlRow(), alignItems: 'center', marginTop: 6, gap: 6 }}>
                          <View style={{ backgroundColor: brand.accentGlow, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                            <Text style={{ color: brand.accent, fontSize: 10, fontWeight: '800' }}>{n.source}</Text>
                          </View>
                          {formattedDate ? (
                            <Text style={{ color: theme.ink[500], fontSize: 10 }}>{formattedDate}</Text>
                          ) : null}
                        </View>
                      </View>
                      {absoluteImage(n.imageUrl) ? (
                        <CachedImage
                          source={{ uri: absoluteImage(n.imageUrl) }}
                          style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: theme.ink[100] }}
                        />
                      ) : (
                        <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 22 }}>📰</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MatchPreviewRow({ match, onPress, brandAccent }: { match: MatchCard; onPress: () => void; brandAccent: string }) {
  const time = (() => {
    const d = new Date(match.date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={{ flexDirection: rtlRow(), alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
            {match.home.team.nameHe}
          </Text>
          <View style={{ marginHorizontal: 12, alignItems: 'center' }}>
            {isLive || isFinished ? (
              // Deterministic RTL score: home is the first child, so with rtlRow()
              // it always renders on the RIGHT (next to the home team) regardless
              // of bidi / I18nManager.isRTL. Avoids number-string reordering quirks.
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: isLive ? brandAccent : theme.ink[900] }}>{match.home.score ?? '-'}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: isLive ? brandAccent : theme.ink[900] }}>{isLive ? ':' : '–'}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: isLive ? brandAccent : theme.ink[900] }}>{match.away.score ?? '-'}</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: theme.ink[500] }}>{time}</Text>
            )}
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.ink[900], textAlign: 'left' }} numberOfLines={1}>
            {match.away.team.nameHe}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function LiveFeatureHero({
  match,
  accentStart,
  accentEnd,
  onPress,
}: {
  match: { id: string; minute: number | null; home: { name: string; score: number | null }; away: { name: string; score: number | null } };
  accentStart: string;
  accentEnd: string;
  onPress: () => void;
}) {
  return (
    <LinearGradient
      colors={[accentStart, accentEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ paddingVertical: 22, paddingHorizontal: 16 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
          <Text style={{ color: 'white', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>חי עכשיו · ליגת העל</Text>
        </View>
      </View>
      <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.home.name.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.home.name}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>בית</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 6 }}>
            <Text style={{ color: 'white', fontSize: 32, fontWeight: '800', lineHeight: 36 }}>{match.home.score ?? '-'}</Text>
            <Text style={{ color: 'white', fontSize: 32, fontWeight: '800', lineHeight: 36 }}>–</Text>
            <Text style={{ color: 'white', fontSize: 32, fontWeight: '800', lineHeight: 36 }}>{match.away.score ?? '-'}</Text>
          </View>
          <View
            style={{
              marginTop: 6,
              flexDirection: rtlRow(),
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'white',
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentStart }} />
            <Text style={{ color: accentStart, fontSize: 11, fontWeight: '800' }}>חי {match.minute ?? '-'}'</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.away.name.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.away.name}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>חוץ</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={{
          alignSelf: 'center',
          marginTop: 18,
          backgroundColor: 'white',
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: accentStart, fontSize: 13, fontWeight: '800' }}>לעמוד המשחק</Text>
      </Pressable>
    </LinearGradient>
  );
}

function UpcomingFeatureHero({
  match,
  accentStart,
  accentEnd,
  onPress,
}: {
  match: MatchCard;
  accentStart: string;
  accentEnd: string;
  onPress: () => void;
}) {
  const d = new Date(match.date);
  const dateLabel = `${d.toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <LinearGradient
      colors={[accentStart, accentEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ paddingVertical: 22, paddingHorizontal: 16 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
          <Text style={{ color: 'white', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>המשחק הבא · ליגת העל</Text>
        </View>
      </View>
      <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.home.team.nameHe.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} logoUrl={match.home.team.logoUrl} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.home.team.nameHe}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>בית</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>VS</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>
            {dateLabel}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <TeamCrest mono={match.away.team.nameHe.slice(0, 2)} bg="rgba(255,255,255,0.2)" fg="white" size={52} radius={14} logoUrl={match.away.team.logoUrl} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
            {match.away.team.nameHe}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600' }}>חוץ</Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        style={{
          alignSelf: 'center',
          marginTop: 18,
          backgroundColor: 'white',
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: accentStart, fontSize: 13, fontWeight: '800' }}>לעמוד המשחק</Text>
      </Pressable>
    </LinearGradient>
  );
}

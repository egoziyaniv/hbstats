import { ScrollView, View, Text, Image, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { absoluteImage } from '@/lib/config';
import { rtlRow } from '@/lib/rtl';
import { useVenueStats } from '@/hooks/useVenueStats';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';

function heDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function VenueScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useVenueStats(id);

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/club' as any); };

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title="אצטדיון" onBack={goBack} showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.accent} /></View>
        <BottomNav />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title="אצטדיון" onBack={goBack} showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center' }}>הדף המבוקש לא נמצא.</Text>
        </View>
        <BottomNav />
      </View>
    );
  }

  const img = absoluteImage(data.venue.imageUrl);
  const rec = data.bsRecord;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title={data.venue.nameHe} onBack={goBack} showBack />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingVertical: 16, gap: 14, paddingBottom: 32 }}
      >
        {/* hero */}
        <View style={{ paddingHorizontal: 16 }}>
          {img ? <Image source={{ uri: img }} style={{ width: '100%', height: 170, borderRadius: 14, backgroundColor: theme.ink[100], marginBottom: 10 }} resizeMode="cover" /> : null}
          <Text style={{ color: theme.ink[900], fontSize: 22, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' }}>{data.venue.nameHe}</Text>
          <Text style={{ color: theme.ink[500], fontSize: 13, fontWeight: '700', textAlign: 'right', marginTop: 3 }}>
            {[data.venue.cityHe, data.venue.capacity ? `${data.venue.capacity.toLocaleString('he-IL')} מושבים` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* stat tiles */}
        <View style={{ paddingHorizontal: 16, flexDirection: rtlRow(), flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexGrow: 1, flexBasis: '46%' }}><Card><Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '700', textAlign: 'right' }}>משחקים באצטדיון</Text><Text style={{ color: theme.ink[900], fontSize: 26, fontWeight: '900', textAlign: 'right', marginTop: 2 }}>{data.totalGames}</Text></Card></View>
          {rec ? (
            <View style={{ flexGrow: 1, flexBasis: '46%' }}><Card><Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '700', textAlign: 'right' }}>מאזן הפועל ב״ש</Text><Text style={{ color: theme.ink[900], fontSize: 18, fontWeight: '900', textAlign: 'right', marginTop: 4 }}>{rec.wins} נ׳ · {rec.draws} ת׳ · {rec.losses} ה׳</Text><Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 2 }}>שערים {rec.goalsFor}:{rec.goalsAgainst}</Text></Card></View>
          ) : null}
          {data.attendance ? (
            <View style={{ flexGrow: 1, flexBasis: '46%' }}><Card><Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '700', textAlign: 'right' }}>קהל ממוצע</Text><Text style={{ color: theme.ink[900], fontSize: 26, fontWeight: '900', textAlign: 'right', marginTop: 2 }}>{data.attendance.avg.toLocaleString('he-IL')}</Text><Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 2 }}>שיא: {data.attendance.max.toLocaleString('he-IL')}</Text></Card></View>
          ) : null}
          {data.biggestWin ? (
            <Pressable style={{ flexGrow: 1, flexBasis: '46%' }} onPress={() => router.push(`/games/${data.biggestWin!.gameId}` as any)}>
              <Card><Text style={{ color: '#b45309', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>הניצחון הגדול</Text><Text style={{ color: theme.ink[900], fontSize: 22, fontWeight: '900', textAlign: 'right', marginTop: 2 }}>{data.biggestWin.scoreHe}</Text><Text style={{ color: theme.ink[500], fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 2 }} numberOfLines={1}>מול {data.biggestWin.opponentHe}</Text></Card>
            </Pressable>
          ) : null}
        </View>

        {/* games list */}
        {data.games.length ? (
          <Section title="משחקים באצטדיון" dense>
            <Card pad={false}>
              {data.games.map((g, i, arr) => (
                <Pressable key={g.id} onPress={() => router.push(`/games/${g.id}` as any)}>
                  <View style={{ flexDirection: rtlRow(), alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, gap: 8, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: theme.ink[100] }}>
                    <Text style={{ width: 62, fontSize: 10.5, fontWeight: '600', color: theme.ink[500] }}>{heDate(g.dateISO)}</Text>
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>{g.homeHe}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: brand.accent }}>{g.homeScore}-{g.awayScore}</Text>
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.ink[900], textAlign: 'left' }} numberOfLines={1}>{g.awayHe}</Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
      <BottomNav />
    </View>
  );
}

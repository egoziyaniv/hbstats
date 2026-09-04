import { ScrollView, View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useClubSeasons } from '@/hooks/useClubSeasons';
import { useSeasonStore } from '@/lib/seasonStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';

const GOLD = '#c8952a';

export default function ClubSeasonsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { setSelectedYear } = useSeasonStore();
  const { data, isLoading, refetch, isRefetching } = useClubSeasons();

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/club' as any); };

  // Deep-link a season row to that season's games (set the app-wide season, open the games tab).
  const openSeason = (year: number) => { setSelectedYear(year); router.push('/(tabs)/games' as any); };

  const seasons = data?.seasons ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="עונה אחר עונה" onBack={goBack} showBack />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 16, paddingBottom: 32 }}
      >
        {isLoading && !data ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={brand.accent} /></View>
        ) : seasons.length === 0 ? (
          <Card><Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center' }}>אין נתונים זמינים.</Text></Card>
        ) : (
          <Card pad={false}>
            {/* header row */}
            <View style={{ flexDirection: rtlRow(), alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, backgroundColor: theme.ink[50], borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '800', color: theme.ink[500], textAlign: 'right' }}>עונה</Text>
              <Text style={{ width: 34, fontSize: 10, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>מיקום</Text>
              <Text style={{ width: 78, fontSize: 10, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>נ-ת-ה</Text>
              <Text style={{ width: 30, fontSize: 10, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>נק׳</Text>
            </View>
            {seasons.map((s, i) => {
              const champion = s.honors.includes('ליגת העל');
              return (
                <Pressable key={s.seasonId} onPress={() => openSeason(s.year)}>
                  <View style={{ flexDirection: rtlRow(), alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: i === seasons.length - 1 ? 0 : 1, borderBottomColor: theme.ink[100], backgroundColor: champion ? 'rgba(200,149,42,0.08)' : 'transparent' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.ink[900], textAlign: 'right' }}>{s.name}</Text>
                      {s.honors.length ? (
                        <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                          {s.honors.map((h) => (
                            <View key={h} style={{ backgroundColor: 'rgba(200,149,42,0.15)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 9.5, fontWeight: '800', color: GOLD }}>{h}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ width: 34, fontSize: 14, fontWeight: '900', color: s.position === 1 ? GOLD : theme.ink[900], textAlign: 'center' }}>{s.position}</Text>
                    <Text style={{ width: 78, fontSize: 11.5, fontWeight: '700', color: theme.ink[700], textAlign: 'center' }}>{s.wins}-{s.draws}-{s.losses}</Text>
                    <Text style={{ width: 30, fontSize: 13, fontWeight: '900', color: theme.ink[900], textAlign: 'center' }}>{s.points}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
      <BottomNav />
    </View>
  );
}

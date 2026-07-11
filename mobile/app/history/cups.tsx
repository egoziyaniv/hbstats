import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useCupHonors } from '@/hooks/useCupHonors';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TeamCrest } from '@/design-system/TeamCrest';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';

export default function CupHonorsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useCupHonors();
  const finals = data?.finals ?? [];
  // Honor roll: only clubs with at least one State Cup win, ranked by that count.
  const stateCupHonors = (data?.honors ?? [])
    .filter((h) => h.stateCup.count > 0)
    .sort((a, b) => b.stateCup.count - a.stateCup.count);
  const skippedDraws = finals.filter((f) => !f.winner).length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="זוכי הגביעים" subtitle="גמרים מאז 1945" onBack={() => router.back()} showBack />
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : finals.length === 0 && stateCupHonors.length === 0 ? (
        // Empty state stays inside a refreshable ScrollView so pull-to-refresh
        // can recover from a transient fetch failure.
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Text style={{ color: theme.ink[700], fontSize: 14 }}>אין נתונים להצגה.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        >
          {stateCupHonors.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                טבלת זוכים — גביע המדינה
              </Text>
              <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 8 }}>
                {stateCupHonors.map((h) => (
                  <Pressable
                    key={h.clubKey}
                    onPress={() => router.push(`/teams/${h.latestTeamId}` as any)}
                    style={{
                      flexDirection: rtlRow(),
                      alignItems: 'center',
                      gap: 6,
                      borderWidth: 1,
                      borderColor: theme.ink[200],
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: 'white',
                    }}
                  >
                    <TeamCrest name={h.nameHe} logoUrl={h.logoUrl} size={18} radius={4} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[900] }} numberOfLines={1}>
                      {h.nameHe}
                    </Text>
                    <View style={{ backgroundColor: theme.ink[100], borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: theme.ink[700] }}>{h.stateCup.count}×</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
              כל הגמרים ({finals.length})
            </Text>
            <Card pad={false}>
              {finals.map((f, i) => (
                <Pressable key={f.gameId} onPress={() => router.push(`/games/${f.gameId}` as any)}>
                  <View
                    style={{
                      flexDirection: rtlRow(),
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderBottomWidth: i === finals.length - 1 ? 0 : 1,
                      borderBottomColor: theme.ink[100],
                    }}
                  >
                    <Text style={{ width: 34, fontSize: 11, fontWeight: '800', color: theme.ink[500] }}>{f.seasonYear}</Text>
                    <View style={{ flex: 1, flexShrink: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                        {f.winner ? `🏆 ${f.winner.nameHe}` : 'לא נקבע'}
                        {f.loser ? ` · ${f.loser.nameHe}` : ''}
                      </Text>
                      <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                        {f.competitionNameHe}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.ink[700] }}>{f.scoreLabel}</Text>
                  </View>
                </Pressable>
              ))}
            </Card>
            {skippedDraws > 0 ? (
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                {skippedDraws} גמרים הסתיימו בתיקו ללא נתוני פנדלים זמינים — הזוכה אינו ידוע.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}
      <BottomNav />
    </View>
  );
}

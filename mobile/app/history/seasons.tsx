import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useSeasonsSpine } from '@/hooks/useSeasonsSpine';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TeamCrest } from '@/design-system/TeamCrest';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';

export default function SeasonsSpineScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useSeasonsSpine();
  const rows = data?.rows ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      {/* Header supports onBack (Header.tsx:17), but only renders the back
          chevron instead of the hamburger when showBack is also set. */}
      <Header title="כל העונות" subtitle="ליגת העל" onBack={() => router.back()} showBack />
      {/* Per-Pressable padding keeps touch targets larger than the text
          bounds; flexWrap so the links don't clip on narrow screens. */}
      <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', columnGap: 8, paddingHorizontal: 8, paddingTop: 2 }}>
        <Pressable onPress={() => router.push('/history/all-time' as any)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: brand.accent }}>🏆 טבלת כל הזמנים ←</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/history/h2h' as any)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: brand.accent }}>⚔️ יריבויות ←</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/history/cups' as any)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: brand.accent }}>🏆 זוכי הגביעים ←</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/history/records' as any)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: brand.accent }}>📖 ספר השיאים ←</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/history/ask' as any)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: brand.accent }}>🎯 שיאים ותשובות ←</Text>
        </Pressable>
      </View>
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : rows.length === 0 ? (
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
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        >
          {rows.map((row) => (
            <Card key={row.seasonId}>
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.ink[900] }}>{row.name}</Text>
                {row.topScorer ? (
                  <Text style={{ fontSize: 11, color: theme.ink[500] }}>
                    ⚽ {row.topScorer.nameHe} · {row.topScorer.goals}
                  </Text>
                ) : null}
              </View>
              {row.champion ? (
                <Pressable
                  onPress={() => router.push(`/teams/${row.champion!.teamId}` as any)}
                  style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 8, marginTop: 8 }}
                >
                  <TeamCrest name={row.champion.nameHe} logoUrl={row.champion.logoUrl} size={22} radius={4} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], flexShrink: 1 }} numberOfLines={1}>
                    🏆 {row.champion.nameHe}
                  </Text>
                  {row.runnerUp ? (
                    <Text style={{ fontSize: 11, color: theme.ink[500], flexShrink: 1 }} numberOfLines={1}>
                      · סגנית: {row.runnerUp.nameHe}
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}
              {row.cupWinner ? (
                <Text style={{ fontSize: 11, color: theme.ink[500], marginTop: 6, textAlign: 'right', writingDirection: 'rtl' }}>
                  🏆 גביע המדינה: {row.cupWinner.nameHe}
                </Text>
              ) : null}
              {row.relegated.length ? (
                <Text style={{ fontSize: 11, color: theme.ink[500], marginTop: 6, textAlign: 'right', writingDirection: 'rtl' }}>
                  ⬇️ {row.relegated.map((r) => r.nameHe).join(' · ')}
                </Text>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      )}
      <BottomNav />
    </View>
  );
}

import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { rtlRow } from '@/lib/rtl';
import { apiClient } from '@/lib/apiClient';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TeamCrest } from '@/design-system/TeamCrest';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { SeasonsSpinePayload } from '@shared/types/mobile-api';

export default function SeasonsSpineScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useQuery<SeasonsSpinePayload>({
    queryKey: ['history', 'seasons'],
    queryFn: () => apiClient.get<SeasonsSpinePayload>('/history/seasons'),
    staleTime: 60 * 60_000,
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      {/* Header supports onBack (Header.tsx:17), but only renders the back
          chevron instead of the hamburger when showBack is also set. */}
      <Header title="כל העונות" subtitle="ליגת העל · 2000 עד היום" onBack={() => router.back()} showBack />
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        >
          {(data?.rows ?? []).map((row) => (
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

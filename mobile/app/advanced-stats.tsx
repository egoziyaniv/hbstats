import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAdvancedStats } from '@/hooks/useAdvancedStats';
import { useSeasonStore } from '@/lib/seasonStore';
import { Header } from '@/design-system/Header';
import { SeasonChip } from '@/design-system/SeasonChip';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { TabBar } from '@/design-system/TabBar';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { AdvancedLeaderboardEntry, AdvancedMetric } from '@shared/types/mobile-api';

const TABS = [
  { id: 'passesKey', label: 'מסירות מפתח' },
  { id: 'duelsWon', label: 'דו-קרבות' },
  { id: 'dribblesSuccess', label: 'דריבלים' },
];

export default function AdvancedStatsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { selectedYear } = useSeasonStore();
  const { data, isLoading, refetch, isRefetching } = useAdvancedStats(selectedYear);
  const [metric, setMetric] = useState<AdvancedMetric>('passesKey');

  const rows: AdvancedLeaderboardEntry[] = data
    ? (metric === 'passesKey' ? data.keyPasses : metric === 'duelsWon' ? data.duelsWon : data.dribblesSuccess)
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header
        title="סטטיסטיקה מתקדמת"
        subtitle={data?.season ? `עונת ${data.season.name}` : undefined}
        rightSlot={<SeasonChip />}
      />
      <TabBar items={TABS} value={metric} onChange={(id) => setMetric(id as AdvancedMetric)} />

      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ paddingVertical: 16, gap: 8, paddingBottom: 80 }}
        >
          {rows.length === 0 ? (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>אין נתונים זמינים.</Text>
            </Card>
          ) : (
            <Card pad={false}>
              {rows.map((row, i) => (
                <Pressable
                  key={row.canonicalId}
                  onPress={() => router.push(`/players/${row.canonicalId}` as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: theme.ink[100] }}
                >
                  <Text style={{ width: 24, textAlign: 'center', fontSize: 12, fontWeight: '900', color: theme.ink[500] }}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink[900] }} numberOfLines={1}>{row.name}</Text>
                    <Text style={{ fontSize: 11, color: theme.ink[500] }} numberOfLines={1}>{row.team} · {row.matches} משחקים</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: theme.ink[900] }}>{row.value.toLocaleString('he')}</Text>
                </Pressable>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
      <BottomNav />
    </View>
  );
}

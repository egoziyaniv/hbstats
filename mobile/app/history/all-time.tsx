import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useAllTimeTable, type AllTimeScope } from '@/hooks/useAllTimeTable';
import { Header } from '@/design-system/Header';
import { TabBar } from '@/design-system/TabBar';
import { Card } from '@/design-system/Card';
import { TeamCrest } from '@/design-system/TeamCrest';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { AllTimeApiRow } from '@shared/types/mobile-api';

export default function AllTimeTableScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const [scope, setScope] = useState<AllTimeScope>('all');
  const { data, isLoading, refetch, isRefetching } = useAllTimeTable(scope);
  const rows = data?.rows ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="טבלת כל הזמנים" subtitle="ליגת העל" onBack={() => router.back()} showBack />
      <Pressable onPress={() => router.push('/history/seasons' as any)} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: brand.accent }}>🗓️ כל העונות — אלופות ומלכי שערים ←</Text>
      </Pressable>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TabBar
          items={[
            { id: 'all', label: 'הכל' },
            { id: 'home', label: 'בית' },
            { id: 'away', label: 'חוץ' },
          ]}
          value={scope}
          onChange={(id) => setScope(id as AllTimeScope)}
        />
      </View>
      {scope !== 'all' ? (
        <Text style={{ paddingHorizontal: 16, paddingTop: 8, fontSize: 11, color: theme.ink[500] }}>
          בית/חוץ מחושב ממשחקים — זמין מ-2000 ואילך
        </Text>
      ) : null}
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
          contentContainerStyle={{ paddingVertical: 16, gap: 16, paddingBottom: 32 }}
        >
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
              <Text style={{ flexShrink: 1, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>קבוצה</Text>
              <Text style={{ marginStart: 'auto', width: 30, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>עונות</Text>
              <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>מ'</Text>
              <Text style={{ width: 32, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>נק'</Text>
            </View>
            {rows.map((row, i) => (
              <AllTimeRowView
                key={row.clubKey}
                row={row}
                rank={i + 1}
                isLast={i === rows.length - 1}
                onPress={() => router.push(`/teams/${row.latestTeamId}` as any)}
              />
            ))}
          </Card>
        </ScrollView>
      )}
      <BottomNav />
    </View>
  );
}

function AllTimeRowView({
  row,
  rank,
  isLast,
  onPress,
}: {
  row: AllTimeApiRow;
  rank: number;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: theme.ink[100],
        }}
      >
        <Text style={{ width: 24, fontSize: 13, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>{rank}</Text>
        <TeamCrest name={row.nameHe} logoUrl={row.logoUrl} size={22} radius={4} style={{ marginStart: 10, marginEnd: 8 }} />
        <Text
          style={{ flexShrink: 1, fontSize: 13.5, fontWeight: '600', color: theme.ink[900], textAlign: 'right' }}
          numberOfLines={1}
        >
          {row.nameHe}
        </Text>
        <Text style={{ marginStart: 'auto', width: 30, fontSize: 11, color: theme.ink[500], textAlign: 'center' }}>{row.seasons}</Text>
        <Text style={{ width: 24, fontSize: 11, color: theme.ink[500], textAlign: 'center' }}>{row.played}</Text>
        <View
          style={{
            width: 32,
            backgroundColor: theme.ink[100],
            borderRadius: 6,
            paddingVertical: 2,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>{row.points}</Text>
        </View>
      </View>
    </Pressable>
  );
}

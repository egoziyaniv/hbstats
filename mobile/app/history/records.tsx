import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter, type Router } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useRecords } from '@/hooks/useRecords';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TeamCrest } from '@/design-system/TeamCrest';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { RecordEntryApi } from '@shared/types/mobile-api';

// computedAt is an ISO string — format the date parts directly, no
// toLocaleDateString (locale/TZ dependent and can shift the day).
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};

export default function RecordsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  // undefined = server default (first category); set once the user picks a chip.
  const [cat, setCat] = useState<string | undefined>(undefined);
  // Club filter — current Ligat Ha'al clubs only; club mode shows the club's
  // whole record book grouped by category.
  const [club, setClub] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, refetch, isRefetching } = useRecords(cat, club);

  const categories = data?.categories ?? [];
  const clubs = data?.clubs ?? [];
  const clubGroups = data?.clubGroups ?? [];
  const activeClub = data?.club ?? null;
  const rows = data?.rows ?? [];
  const activeKey = data?.category;
  const activeCategory = categories.find((c) => c.key === activeKey);
  const allVisibleRows = activeClub ? clubGroups.flatMap((g) => g.rows) : rows;
  const latestComputedAt = allVisibleRows.reduce<string | null>(
    (max, r) => (!max || r.computedAt > max ? r.computedAt : max),
    null,
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="ספר השיאים" subtitle="ליגת העל" onBack={() => router.back()} showBack />
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : isError && !data ? (
        // Error/empty states stay inside a refreshable ScrollView so
        // pull-to-refresh can recover from a transient fetch failure.
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Text style={{ color: theme.ink[700], fontSize: 14 }}>שגיאה בטעינת הנתונים.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        >
          {clubs.length > 0 ? (
            // Club filter row — "כל הליגה" + current top-flight clubs.
            // nestedScrollEnabled — horizontal row inside the vertical ScrollView.
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, paddingHorizontal: 2 }}
            >
              <Chip
                label="כל הליגה"
                selected={!club}
                onPress={() => setClub(undefined)}
                brandAccent={brand.accent}
                brandGlow={brand.accentGlow}
              />
              {clubs.map((c) => (
                <Chip
                  key={c.clubKey}
                  label={c.nameHe}
                  logoUrl={c.logoUrl}
                  selected={club === c.clubKey}
                  onPress={() => setClub(club === c.clubKey ? undefined : c.clubKey)}
                  brandAccent={brand.accent}
                  brandGlow={brand.accentGlow}
                />
              ))}
            </ScrollView>
          ) : null}

          {!activeClub && categories.length > 0 ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, paddingHorizontal: 2 }}
            >
              {categories.map((c) => (
                <Chip
                  key={c.key}
                  label={c.titleHe}
                  selected={c.key === activeKey}
                  onPress={() => setCat(c.key)}
                  brandAccent={brand.accent}
                  brandGlow={brand.accentGlow}
                />
              ))}
            </ScrollView>
          ) : null}

          {activeClub ? (
            clubGroups.length === 0 ? (
              <Card>
                <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>
                  אין עדיין שיאים לקבוצה זו.
                </Text>
              </Card>
            ) : (
              clubGroups.map((g) => (
                <View key={g.category} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                    {g.titleHe}
                  </Text>
                  <RecordRowsCard rows={g.rows} router={router} />
                </View>
              ))
            )
          ) : rows.length === 0 ? (
            <Card>
              <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>
                ספר השיאים טרם נבנה — הריצו עדכון מהאדמין.
              </Text>
            </Card>
          ) : (
            <RecordRowsCard rows={rows} router={router} />
          )}

          <View style={{ gap: 4 }}>
            {latestComputedAt ? (
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                עודכן: {fmtDate(latestComputedAt)}
              </Text>
            ) : null}
            {!activeClub && activeCategory?.eventBased ? (
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                נתוני אירועים מ-2006 ואילך
              </Text>
            ) : null}
            {activeClub || activeCategory?.ordered ? (
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                רצפים מחושבים מעונות עם תאריכי משחק מלאים
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}
      <BottomNav />
    </View>
  );
}

function RecordRowsCard({ rows, router }: { rows: RecordEntryApi[]; router: Router }) {
  return (
    <Card pad={false}>
      {rows.map((row, i) => {
        const content = (
          <View
            style={{
              flexDirection: rtlRow(),
              alignItems: 'center',
              gap: 10,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderBottomWidth: i === rows.length - 1 ? 0 : 1,
              borderBottomColor: theme.ink[100],
            }}
          >
            <Text style={{ width: 22, fontSize: 13, fontWeight: '900', color: theme.ink[500], textAlign: 'center' }}>
              {row.rank}
            </Text>
            <View style={{ flex: 1, flexShrink: 1 }}>
              <Text
                style={{ fontSize: 13, fontWeight: '700', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }}
                numberOfLines={2}
              >
                {row.labelHe}
              </Text>
              {row.detailHe ? (
                <Text
                  style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl', marginTop: 2 }}
                  numberOfLines={1}
                >
                  {row.detailHe}
                </Text>
              ) : null}
            </View>
          </View>
        );
        return row.gameId ? (
          <Pressable key={row.id} onPress={() => router.push(`/games/${row.gameId}` as any)}>
            {content}
          </Pressable>
        ) : (
          <View key={row.id}>{content}</View>
        );
      })}
    </Card>
  );
}

function Chip({
  label,
  logoUrl,
  selected,
  onPress,
  brandAccent,
  brandGlow,
}: {
  label: string;
  logoUrl?: string | null;
  selected: boolean;
  onPress: () => void;
  brandAccent: string;
  brandGlow: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: rtlRow(),
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? brandAccent : theme.ink[200],
        backgroundColor: selected ? brandGlow : 'white',
      }}
    >
      {logoUrl !== undefined ? <TeamCrest name={label} logoUrl={logoUrl} size={16} radius={8} /> : null}
      <Text style={{ fontSize: 12, fontWeight: '800', color: selected ? theme.ink[900] : theme.ink[700] }}>
        {label}
      </Text>
    </Pressable>
  );
}

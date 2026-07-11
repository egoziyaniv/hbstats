import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useRecords } from '@/hooks/useRecords';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { RecordCategoryApi } from '@shared/types/mobile-api';

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
  const { data, isLoading, isError, refetch, isRefetching } = useRecords(cat);

  const categories = data?.categories ?? [];
  const rows = data?.rows ?? [];
  const activeKey = data?.category;
  const activeCategory = categories.find((c) => c.key === activeKey);
  const latestComputedAt = rows.reduce<string | null>(
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
          {categories.length > 0 ? (
            // nestedScrollEnabled — horizontal row inside the screen's vertical
            // ScrollView; without it Android can swallow the inner scroll.
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, paddingHorizontal: 2 }}
            >
              {categories.map((c) => (
                <CategoryChip
                  key={c.key}
                  category={c}
                  selected={c.key === activeKey}
                  onPress={() => setCat(c.key)}
                  brandAccent={brand.accent}
                  brandGlow={brand.accentGlow}
                />
              ))}
            </ScrollView>
          ) : null}

          {rows.length === 0 ? (
            <Card>
              <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>
                ספר השיאים טרם נבנה — הריצו עדכון מהאדמין.
              </Text>
            </Card>
          ) : (
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
          )}

          <View style={{ gap: 4 }}>
            {latestComputedAt ? (
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                עודכן: {fmtDate(latestComputedAt)}
              </Text>
            ) : null}
            {activeCategory?.eventBased ? (
              <Text style={{ fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                נתוני אירועים מ-2006 ואילך
              </Text>
            ) : null}
            {activeCategory?.ordered ? (
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

function CategoryChip({
  category,
  selected,
  onPress,
  brandAccent,
  brandGlow,
}: {
  category: RecordCategoryApi;
  selected: boolean;
  onPress: () => void;
  brandAccent: string;
  brandGlow: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? brandAccent : theme.ink[200],
        backgroundColor: selected ? brandGlow : 'white',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: selected ? '800' : '600', color: selected ? theme.ink[900] : theme.ink[700] }}>
        {category.titleHe}
      </Text>
    </Pressable>
  );
}

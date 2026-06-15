import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { openExternalUrl } from '@/lib/openExternal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { rtlRow } from '@/lib/rtl';
import { CachedImage } from '@/design-system/CachedImage';
import { absoluteImage } from '@/lib/config';
import { useNews } from '@/hooks/useNews';
import { useTheme } from '@/contexts/ThemeContext';
import { Card } from '@/design-system/Card';
import { BackButton } from '@/design-system/BackButton';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { NewsCard as NewsItemType } from '@shared/types/common';

export default function NewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useNews(40);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as any));

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <LinearGradient
        colors={[brand.accent, brand.accentDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 8 }}
      >
        <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
            <BackButton onPress={goBack} />
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>חדשות</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>
      </LinearGradient>

      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />
          }
        >
          {!data || data.items.length === 0 ? (
            <Card>
              <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16, writingDirection: 'rtl' }}>
                אין חדשות זמינות כרגע.
              </Text>
            </Card>
          ) : (
            <Card pad={false}>
              {data.items.map((n, i, arr) => (
                <NewsRow
                  key={n.id}
                  item={n}
                  brandAccent={brand.accent}
                  brandGlow={brand.accentGlow}
                  isLast={i === arr.length - 1}
                />
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      <BottomNav />
    </View>
  );
}

function NewsRow({
  item,
  brandAccent,
  brandGlow,
  isLast,
}: {
  item: NewsItemType;
  brandAccent: string;
  brandGlow: string;
  isLast: boolean;
}) {
  const formattedDate = (() => {
    if (!item.publishedAt) return null;
    const d = new Date(item.publishedAt);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return `היום · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();

  return (
    <Pressable onPress={() => openExternalUrl(item.url)}>
      <View
        style={{
          flexDirection: rtlRow(),
          gap: 12,
          padding: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: theme.ink[100],
        }}
      >
        {absoluteImage(item.imageUrl) ? (
          <CachedImage
            source={{ uri: absoluteImage(item.imageUrl) }}
            style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: theme.ink[100] }}
          />
        ) : (
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 10,
              backgroundColor: brandGlow,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 24 }}>📰</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: theme.ink[900], fontSize: 14, lineHeight: 20, textAlign: 'right', writingDirection: 'rtl' }}
            numberOfLines={3}
          >
            {item.preview}
          </Text>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: brandGlow, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ color: brandAccent, fontSize: 10, fontWeight: '800', writingDirection: 'rtl' }}>{item.source}</Text>
            </View>
            {item.team ? (
              <View style={{ backgroundColor: theme.ink[100], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ color: theme.ink[700], fontSize: 10, fontWeight: '700', writingDirection: 'rtl' }}>{item.team}</Text>
              </View>
            ) : null}
            {formattedDate ? <Text style={{ color: theme.ink[500], fontSize: 10 }}>{formattedDate}</Text> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

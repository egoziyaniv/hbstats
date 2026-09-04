import { ScrollView, View, Text, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { absoluteImage } from '@/lib/config';
import { useClubPage } from '@/hooks/useClubPage';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { ClubPageCategory } from '@shared/types/mobile-api';

const CATEGORY_HE: Record<ClubPageCategory, string> = {
  HISTORY: 'היסטוריה',
  STADIUM: 'האצטדיון',
  IDENTITY: 'זהות',
  CULTURE: 'תרבות',
};

export default function ClubPageScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useClubPage(slug);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/club' as any);
  };

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title="הקבוצה" onBack={goBack} showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
        <BottomNav />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title="הקבוצה" onBack={goBack} showBack />
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center' }}>
            הדף המבוקש לא נמצא.
          </Text>
        </ScrollView>
        <BottomNav />
      </View>
    );
  }

  const hero = absoluteImage(data.heroImageUrl);

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="הקבוצה" onBack={goBack} showBack />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      >
        {/* Hero: category chip + title + optional image */}
        <View style={{ alignItems: 'flex-start', gap: 8 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: brand.accent, fontSize: 11, fontWeight: '800' }}>{CATEGORY_HE[data.category]}</Text>
          </View>
          <Text style={{ color: theme.ink[900], fontSize: 24, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl', lineHeight: 30 }}>
            {data.title}
          </Text>
        </View>

        {hero ? (
          <Image source={{ uri: hero }} style={{ width: '100%', height: 200, borderRadius: 14, backgroundColor: theme.ink[100] }} resizeMode="cover" />
        ) : null}

        <Card>
          <Text style={{ color: theme.ink[900], fontSize: 15, writingDirection: 'rtl', textAlign: 'right', lineHeight: 26 }}>
            {data.bodyHe}
          </Text>
        </Card>
      </ScrollView>
      <BottomNav />
    </View>
  );
}

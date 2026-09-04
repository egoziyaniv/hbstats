import { ScrollView, View, Text, Image, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Svg, Path } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { absoluteImage } from '@/lib/config';
import { useClubHub } from '@/hooks/useClubHub';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type {
  ClubHonorGroup,
  HallOfFameItem,
  HallOfFameRole,
  ClubPageSummary,
  ClubPageCategory,
} from '@shared/types/mobile-api';

// Trophy accent — deliberately gold, independent of the user-picked brand hue.
const GOLD = '#C9A227';
const GOLD_SOFT = 'rgba(201, 162, 39, 0.14)';

const ROLE_HE: Record<HallOfFameRole, string> = {
  PLAYER: 'שחקן',
  COACH: 'מאמן',
  LEGEND: 'אגדה',
};

const CATEGORY_HE: Record<ClubPageCategory, string> = {
  HISTORY: 'היסטוריה',
  STADIUM: 'האצטדיון',
  IDENTITY: 'זהות',
  CULTURE: 'תרבות',
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

function TrophyIcon({ color = GOLD, size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <Path d="M4 22h16" />
      <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </Svg>
  );
}

function ChevronStart({ color }: { color: string }) {
  // Points to the visual LEFT (RTL "forward"); rendered at the row's end edge.
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

/** Rounded-square initials badge used as a crest fallback. */
function Monogram({ text, size, bg, fg, radius }: { text: string; size: number; bg: string; fg: string; radius?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.28),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: fg, fontSize: size * 0.4, fontWeight: '900' }}>{text}</Text>
    </View>
  );
}

function Hero({ totalTitles }: { totalTitles: number }) {
  const { brand } = useTheme();
  return (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
      <Monogram text={'בש'} size={64} bg={brand.accent} fg="white" radius={16} />
      <View style={{ flex: 1, alignItems: 'flex-start', gap: 3 }}>
        <Text style={{ color: theme.ink[900], fontSize: 22, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' }}>
          הפועל באר שבע
        </Text>
        <Text style={{ color: theme.ink[500], fontSize: 13, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' }}>
          הגמלים · האדומים מהדרום
        </Text>
        {totalTitles > 0 ? (
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: GOLD_SOFT, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <TrophyIcon size={14} />
            <Text style={{ color: theme.ink[900], fontSize: 12.5, fontWeight: '800' }}>{totalTitles} תארים</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function HonorCard({ group }: { group: ClubHonorGroup }) {
  return (
    <Card>
      <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 10 }}>
        <TrophyIcon />
        <Text style={{ flex: 1, color: theme.ink[900], fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={2}>
          {group.competitionHe}
        </Text>
        {group.winners.length > 0 ? (
          <View style={{ minWidth: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD_SOFT, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: GOLD, fontSize: 19, fontWeight: '900' }}>{group.winners.length}</Text>
          </View>
        ) : null}
      </View>
      {group.winners.length > 0 ? (
        <Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '500', textAlign: 'right', writingDirection: 'rtl', lineHeight: 20, marginTop: 8 }}>
          {group.winners.join(' · ')}
        </Text>
      ) : null}
      {group.runnersUp.length > 0 ? (
        <Text style={{ color: theme.ink[500], fontSize: 11, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl', marginTop: 6 }}>
          סגן אלופה · {group.runnersUp.length}
        </Text>
      ) : null}
    </Card>
  );
}

function HallOfFameRow({ item, isLast, onPress }: { item: HallOfFameItem; isLast: boolean; onPress?: () => void }) {
  const { brand } = useTheme();
  const photo = absoluteImage(item.photoUrl);
  const meta = [ROLE_HE[item.role], item.years].filter(Boolean).join(' · ');
  const content = (
    <View
      style={{
        flexDirection: rtlRow(),
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.ink[100],
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.ink[100] }} />
      ) : (
        <Monogram text={initials(item.nameHe)} size={52} bg={brand.accentGlow} fg={brand.accent} radius={26} />
      )}
      <View style={{ flex: 1, alignItems: 'flex-start', gap: 3 }}>
        <Text style={{ color: theme.ink[900], fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
          {item.nameHe}
        </Text>
        {meta ? (
          <Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {item.blurbHe ? (
          <Text style={{ color: theme.ink[500], fontSize: 11.5, fontWeight: '400', textAlign: 'right', writingDirection: 'rtl', lineHeight: 17 }} numberOfLines={2}>
            {item.blurbHe}
          </Text>
        ) : null}
        {item.statLineHe ? (
          <View style={{ alignSelf: 'flex-start', backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 }}>
            <Text style={{ color: brand.accent, fontSize: 10.5, fontWeight: '800' }}>{item.statLineHe}</Text>
          </View>
        ) : null}
      </View>
      {onPress ? <ChevronStart color={theme.ink[300]} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : <View>{content}</View>;
}

function PageRow({ page, isLast, onPress }: { page: ClubPageSummary; isLast: boolean; onPress: () => void }) {
  const { brand } = useTheme();
  const hero = absoluteImage(page.heroImageUrl);
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: theme.ink[100],
        }}
      >
        {hero ? (
          <Image source={{ uri: hero }} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: theme.ink[100] }} />
        ) : null}
        <View style={{ flex: 1, alignItems: 'flex-start', gap: 5 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: brand.accent, fontSize: 10.5, fontWeight: '800' }}>{CATEGORY_HE[page.category]}</Text>
          </View>
          <Text style={{ color: theme.ink[900], fontSize: 14.5, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={2}>
            {page.title}
          </Text>
        </View>
        <ChevronStart color={theme.ink[300]} />
      </View>
    </Pressable>
  );
}

export default function ClubHubScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useClubHub();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/standings' as any);
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

  const honors = data?.honors ?? [];
  const hallOfFame = data?.hallOfFame ?? [];
  const pages = data?.pages ?? [];
  const isEmpty = honors.length === 0 && hallOfFame.length === 0 && pages.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="הקבוצה" onBack={goBack} showBack />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
      >
        <Hero totalTitles={data?.totalTitles ?? 0} />

        {isEmpty ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center' }}>
              המידע על המועדון עדיין לא זמין.
            </Text>
          </View>
        ) : null}

        {honors.length > 0 ? (
          <Section title="לוח התארים">
            <View style={{ gap: 10 }}>
              {honors.map((group) => (
                <HonorCard key={group.competitionHe} group={group} />
              ))}
            </View>
          </Section>
        ) : null}

        {hallOfFame.length > 0 ? (
          <Section title="היכל התהילה">
            <Card pad={false}>
              {hallOfFame.map((item, i) => (
                <HallOfFameRow
                  key={item.id}
                  item={item}
                  isLast={i === hallOfFame.length - 1}
                  onPress={() => router.push(('/club/legends/' + item.id) as any)}
                />
              ))}
            </Card>
          </Section>
        ) : null}

        {pages.length > 0 ? (
          <Section title="הכר את המועדון">
            <Card pad={false}>
              {pages.map((page, i) => (
                <PageRow
                  key={page.slug}
                  page={page}
                  isLast={i === pages.length - 1}
                  onPress={() => router.push(('/club/' + encodeURIComponent(page.slug)) as any)}
                />
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
      <BottomNav />
    </View>
  );
}

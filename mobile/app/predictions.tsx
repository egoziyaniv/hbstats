import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { rtlRow } from '@/lib/rtl';
import { TeamCrest } from '@/design-system/TeamCrest';
import { absoluteImage } from '@/lib/config';
import { usePredictions } from '@/hooks/usePredictions';
import { useTheme } from '@/contexts/ThemeContext';
import { Card } from '@/design-system/Card';
import { BackButton } from '@/design-system/BackButton';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { PredictionItem } from '@shared/types/mobile-api';

export default function PredictionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = usePredictions();

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
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>תחזיות</Text>
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
                אין תחזיות זמינות כרגע. תחזיות מופיעות למשחקים מתוזמנים בלבד.
              </Text>
            </Card>
          ) : (
            data.items.map((item) => (
              <PredictionCard key={item.gameId} item={item} brand={brand} onPress={() => router.push(`/games/${item.gameId}` as any)} />
            ))
          )}
        </ScrollView>
      )}

      <BottomNav />
    </View>
  );
}

function PredictionCard({
  item,
  brand,
  onPress,
}: {
  item: PredictionItem;
  brand: { accent: string; accentGlow: string; accentDeep?: string };
  onPress: () => void;
}) {
  const d = new Date(item.dateTime);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const winnerHighlight = item.winnerName;

  return (
    <Pressable onPress={onPress}>
      <Card pad={false}>
        {/* Header — date + competition */}
        <View
          style={{
            flexDirection: rtlRow(),
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: theme.ink[50],
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink[700], writingDirection: 'rtl' }}>
            {item.competition}
          </Text>
          <Text style={{ fontSize: 11, color: theme.ink[500] }}>{dateStr}</Text>
        </View>

        {/* Teams + percentages */}
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
            <TeamSide team={item.homeTeam} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink[500] }}>VS</Text>
            <TeamSide team={item.awayTeam} />
          </View>

          {/* Probability bar */}
          {item.percentHome !== null && item.percentDraw !== null && item.percentAway !== null ? (
            <View style={{ marginTop: 14 }}>
              <View
                style={{
                  flexDirection: rtlRow(),
                  height: 28,
                  borderRadius: 8,
                  overflow: 'hidden',
                  backgroundColor: theme.ink[100],
                }}
              >
                {item.percentHome > 0 ? (
                  <View style={{ flex: item.percentHome, backgroundColor: brand.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{item.percentHome}%</Text>
                  </View>
                ) : null}
                {item.percentDraw > 0 ? (
                  <View style={{ flex: item.percentDraw, backgroundColor: theme.ink[300], alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{item.percentDraw}%</Text>
                  </View>
                ) : null}
                {item.percentAway > 0 ? (
                  <View style={{ flex: item.percentAway, backgroundColor: brand.accentDeep ?? brand.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{item.percentAway}%</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 10, color: theme.ink[500], writingDirection: 'rtl' }}>בית</Text>
                <Text style={{ fontSize: 10, color: theme.ink[500] }}>תיקו</Text>
                <Text style={{ fontSize: 10, color: theme.ink[500], writingDirection: 'rtl' }}>חוץ</Text>
              </View>
            </View>
          ) : null}

          {/* Winner / advice */}
          {winnerHighlight || item.adviceHe || item.underOver ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: brand.accentGlow,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                gap: 4,
              }}
            >
              {winnerHighlight ? (
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }}>
                  המנצח הצפוי: {winnerHighlight}
                </Text>
              ) : null}
              {item.winnerCommentHe ? (
                <Text style={{ fontSize: 12, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }}>
                  {item.winnerCommentHe}
                </Text>
              ) : null}
              {item.adviceHe ? (
                <Text style={{ fontSize: 12, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }}>
                  המלצה: {item.adviceHe}
                </Text>
              ) : null}
              {item.underOver ? (
                <Text style={{ fontSize: 12, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }}>
                  שערים: {item.underOver}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function TeamSide({ team }: { team: PredictionItem['homeTeam'] }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 4 }}>
      <TeamCrest name={team.nameHe} logoUrl={team.logoUrl} size={44} radius={6} />
      <Text
        style={{ fontSize: 12, fontWeight: '700', color: theme.ink[900], marginTop: 4, textAlign: 'center', writingDirection: 'rtl' }}
        numberOfLines={2}
      >
        {team.nameHe}
      </Text>
    </View>
  );
}

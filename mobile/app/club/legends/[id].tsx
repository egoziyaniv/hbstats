import { ScrollView, View, Text, Image, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Svg, Path } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { absoluteImage } from '@/lib/config';
import { useLegend } from '@/hooks/useLegend';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { HallOfFameRole } from '@shared/types/mobile-api';

const ROLE_HE: Record<HallOfFameRole, string> = {
  PLAYER: 'שחקן',
  COACH: 'מאמן',
  LEGEND: 'אגדה',
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

function openUrl(url: string) {
  // expo-web-browser is not a dependency — open in the system browser.
  Linking.openURL(url).catch(() => {});
}

function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={color} stroke="none">
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

function ChevronStart({ color }: { color: string }) {
  // Points to the visual LEFT (RTL "forward").
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

/** Rounded initials badge used as a photo fallback. */
function Monogram({ text, size, bg, fg }: { text: string; size: number; bg: string; fg: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: fg, fontSize: size * 0.38, fontWeight: '900' }}>{text}</Text>
    </View>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  const { brand } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        backgroundColor: brand.accentGlow,
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ color: brand.accent, fontSize: 26, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: theme.ink[500], fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export default function LegendDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, error } = useLegend(id);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/club' as any);
  };

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title="היכל התהילה" onBack={goBack} showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
        <BottomNav />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title="היכל התהילה" onBack={goBack} showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.ink[700], fontSize: 14, textAlign: 'center', writingDirection: 'rtl' }}>
            הדף המבוקש לא נמצא.
          </Text>
        </View>
        <BottomNav />
      </View>
    );
  }

  const heroPhoto = absoluteImage(data.photoUrl ?? data.playerSummary?.photoUrl ?? null);
  const meta = [ROLE_HE[data.role], data.years].filter(Boolean).join(' · ');
  const summary = data.playerSummary;
  const hasContribution = !!summary || !!data.statLineHe;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="היכל התהילה" onBack={goBack} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 4 }}>
          {heroPhoto ? (
            <Image source={{ uri: heroPhoto }} style={{ width: 108, height: 108, borderRadius: 54, backgroundColor: theme.ink[100] }} />
          ) : (
            <Monogram text={initials(data.nameHe)} size={108} bg={brand.accentGlow} fg={brand.accent} />
          )}
          <Text style={{ color: theme.ink[900], fontSize: 24, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl' }}>
            {data.nameHe}
          </Text>
          {meta ? (
            <Text style={{ color: theme.ink[500], fontSize: 13.5, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' }}>
              {meta}
            </Text>
          ) : null}
          {data.statLineHe ? (
            <View style={{ backgroundColor: brand.accentGlow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ color: brand.accent, fontSize: 12.5, fontWeight: '800' }}>{data.statLineHe}</Text>
            </View>
          ) : null}
        </View>

        {/* Contribution & stats */}
        {hasContribution ? (
          <Section title="תרומה וסטטיסטיקה">
            {summary ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: rtlRow(), gap: 12 }}>
                  <StatTile value={summary.appearances} label="הופעות" />
                  <StatTile value={summary.goals} label="שערים" />
                </View>
                {data.playerId ? (
                  <Pressable
                    onPress={() => router.push(('/players/' + data.playerId!) as any)}
                    style={{
                      flexDirection: rtlRow(),
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'white',
                      borderWidth: 1,
                      borderColor: theme.ink[200],
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                    }}
                  >
                    <Text style={{ color: theme.ink[900], fontSize: 14, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl', flexShrink: 1 }} numberOfLines={1}>
                      לדף השחקן המלא
                    </Text>
                    <ChevronStart color={brand.accent} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Card>
                <Text style={{ color: theme.ink[900], fontSize: 14.5, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', lineHeight: 24 }}>
                  {data.statLineHe}
                </Text>
              </Card>
            )}
          </Section>
        ) : null}

        {/* Blurb */}
        {data.blurbHe ? (
          <Card>
            <Text style={{ color: theme.ink[900], fontSize: 15, writingDirection: 'rtl', textAlign: 'right', lineHeight: 26 }}>
              {data.blurbHe}
            </Text>
          </Card>
        ) : null}

        {/* Video */}
        {data.videoEmbedUrl ? (
          <Pressable
            onPress={() => openUrl(data.videoEmbedUrl!)}
            style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.accent, borderRadius: 12, paddingVertical: 12 }}
          >
            <PlayIcon color="white" />
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>צפייה בסרטון</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <BottomNav />
    </View>
  );
}

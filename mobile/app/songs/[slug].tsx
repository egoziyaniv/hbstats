import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Svg, Path } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { useSong } from '@/hooks/useSong';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { SongType } from '@shared/types/mobile-api';

const TYPE_HE: Record<SongType, string> = {
  STAND: 'שיר יציע',
  PLAYER: 'שיר שחקן',
  STUDIO: 'שיר אולפן',
  CHAMPIONSHIP: 'שיר אליפות',
};

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

function ChevronIcon({ color, open }: { color: string; open: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </Svg>
  );
}

function TypeChip({ type }: { type: SongType }) {
  const { brand } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: brand.accent, fontSize: 11, fontWeight: '800' }}>{TYPE_HE[type]}</Text>
    </View>
  );
}

function MetaRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const { brand } = useTheme();
  const body = (
    <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}>
      <Text style={{ color: theme.ink[500], fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: onPress ? brand.accent : theme.ink[900], fontSize: 13, fontWeight: '800', textAlign: 'left', flexShrink: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export default function SongDetailScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading } = useSong(slug);
  const [chordsOpen, setChordsOpen] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/songs' as any);
  };

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header showBack onBack={goBack} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      </View>
    );
  }

  const hasMeta = data.debutSeasonYear != null || data.performerGroup || data.originalMelody;

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header showBack onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        {/* Title + type */}
        <View style={{ alignItems: 'flex-start', gap: 8 }}>
          <TypeChip type={data.type} />
          <Text style={{ color: theme.ink[900], fontSize: 22, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' }}>
            {data.titleHe}
          </Text>
        </View>

        {/* Content warning */}
        {data.contentWarning ? (
          <View style={{ backgroundColor: theme.status.liveBg, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ color: '#991B1B', fontSize: 12.5, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', lineHeight: 19 }}>
              שימו לב: היציע מתועד כפי שהוא, וייתכן תוכן בוטה.
            </Text>
          </View>
        ) : null}

        {/* Meta */}
        {hasMeta ? (
          <Card>
            {data.debutSeasonYear != null ? <MetaRow label="בכורה" value={String(data.debutSeasonYear)} /> : null}
            {data.performerGroup ? <MetaRow label="ארגון" value={data.performerGroup} /> : null}
            {data.originalMelody ? (
              <MetaRow
                label="שיר מקור"
                value={data.originalMelody}
                onPress={data.originalMelodyUrl ? () => openUrl(data.originalMelodyUrl!) : undefined}
              />
            ) : null}
          </Card>
        ) : null}

        {/* Lyrics */}
        {data.lyricsHe ? (
          <Card>
            <Section title="מילים">
              <Text style={{ color: theme.ink[900], fontSize: 15, writingDirection: 'rtl', textAlign: 'right', lineHeight: 28 }}>
                {data.lyricsHe}
              </Text>
            </Section>
          </Card>
        ) : null}

        {/* Chords (collapsible) */}
        {data.chordsHe ? (
          <Card>
            <Pressable onPress={() => setChordsOpen((v) => !v)} style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 8 }}>
                <View style={{ width: 3, height: 16, backgroundColor: brand.accent, borderRadius: 2 }} />
                <Text style={{ color: theme.ink[900], fontSize: 15, fontWeight: '800' }}>אקורדים</Text>
              </View>
              <ChevronIcon color={theme.ink[500]} open={chordsOpen} />
            </Pressable>
            {chordsOpen ? (
              <Text
                style={{
                  color: theme.ink[700],
                  fontSize: 13,
                  fontFamily: 'Courier',
                  writingDirection: 'rtl',
                  textAlign: 'right',
                  lineHeight: 24,
                  marginTop: 10,
                }}
              >
                {data.chordsHe}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Videos */}
        {data.videoEmbedUrls.length > 0 ? (
          <View style={{ gap: 8 }}>
            {data.videoEmbedUrls.map((url, i) => (
              <Pressable
                key={url + i}
                onPress={() => openUrl(url)}
                style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.accent, borderRadius: 12, paddingVertical: 12 }}
              >
                <PlayIcon color="white" />
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>
                  {data.videoEmbedUrls.length > 1 ? `צפייה בווידאו ${i + 1}` : 'צפייה בווידאו'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Linked player */}
        {data.player ? (
          <Pressable
            onPress={() => router.push(`/players/${data.player!.id}` as any)}
            style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', borderWidth: 1, borderColor: theme.ink[200], borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 }}
          >
            <Text style={{ color: theme.ink[900], fontSize: 14, fontWeight: '800', textAlign: 'right', flexShrink: 1 }} numberOfLines={1}>
              שיר השחקן של {data.player.nameHe}
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={brand.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 6l-6 6 6 6" />
            </Svg>
          </Pressable>
        ) : null}
      </ScrollView>
      <BottomNav />
    </View>
  );
}

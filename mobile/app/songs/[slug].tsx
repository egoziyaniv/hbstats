import { useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Svg, Path } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { absoluteImage } from '@/lib/config';
import { useSong } from '@/hooks/useSong';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { CachedImage } from '@/design-system/CachedImage';
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

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ color: theme.ink[900], fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: theme.ink[500], fontSize: 11, fontWeight: '700', marginTop: 2 }}>{label}</Text>
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

        {/* The player the chant is about — his real numbers + a way through to
            his page, where the full per-season statistics live. */}
        {data.player ? (
          <Card pad={false}>
            <Pressable
              onPress={() => router.push(`/players/${data.player!.id}` as any)}
              style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 12, padding: 14 }}
            >
              {absoluteImage(data.playerSummary?.photoUrl ?? data.player.photoUrl) ? (
                <CachedImage
                  source={{ uri: absoluteImage(data.playerSummary?.photoUrl ?? data.player.photoUrl) }}
                  style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 1, borderColor: theme.ink[200] }}
                />
              ) : (
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: brand.accent, fontSize: 22, fontWeight: '900' }}>{data.player.nameHe.slice(0, 1)}</Text>
                </View>
              )}
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <Text style={{ color: theme.ink[500], fontSize: 11, fontWeight: '800' }}>שיר השחקן של</Text>
                <Text style={{ color: theme.ink[900], fontSize: 19, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>
                  {data.player.nameHe}
                </Text>
                {data.playerSummary ? (
                  <Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '600', textAlign: 'right' }} numberOfLines={1}>
                    {[
                      data.playerSummary.position,
                      data.playerSummary.firstLabel
                        ? `הפועל באר שבע ${data.playerSummary.firstLabel}${
                            data.playerSummary.lastLabel && data.playerSummary.lastLabel !== data.playerSummary.firstLabel
                              ? `–${data.playerSummary.lastLabel}`
                              : ''
                          }`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </View>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.ink[300]} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M15 6l-6 6 6 6" />
              </Svg>
            </Pressable>

            {data.playerSummary ? (
              <>
                <View style={{ flexDirection: rtlRow(), borderTopWidth: 1, borderTopColor: theme.ink[100] }}>
                  <StatTile value={data.playerSummary.appearances} label="הופעות" />
                  <View style={{ width: 1, backgroundColor: theme.ink[100] }} />
                  <StatTile value={data.playerSummary.goals} label="שערים" />
                  <View style={{ width: 1, backgroundColor: theme.ink[100] }} />
                  <StatTile value={data.playerSummary.assists} label="בישולים" />
                </View>
                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: theme.ink[100] }}>
                  <Pressable
                    onPress={() => router.push(`/players/${data.player!.id}` as any)}
                    style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.accent, borderRadius: 12, paddingVertical: 11 }}
                  >
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>לדף השחקן והסטטיסטיקות</Text>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M15 6l-6 6 6 6" />
                    </Svg>
                  </Pressable>
                </View>
              </>
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

      </ScrollView>
      <BottomNav />
    </View>
  );
}

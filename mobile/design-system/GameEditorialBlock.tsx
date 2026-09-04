/**
 * GameEditorialBlock — editor-curated per-game content for the match overview:
 *   • a "פקט מהמשחק" callout (match fact),
 *   • video buttons (recap + full match) that open the embed in the browser,
 *   • a written report (title + body),
 *   • a horizontal strip of match photos.
 *
 * Every part renders only when its data is present; the whole block collapses
 * to null when there is neither editorial content nor a gallery. RTL throughout,
 * theme tokens only — mirrors the look of SofascoreMatchStatsPanel.
 */

import { View, Text, Pressable, ScrollView, Image, Linking } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { absoluteImage } from '@/lib/config';
import { useTheme } from '@/contexts/ThemeContext';
import type { MatchEditorial, MatchGalleryPhoto } from '@shared/types/mobile-api';
import { Card } from './Card';
import { theme } from './theme';

/** Filled play triangle used on the video buttons. */
function PlayIcon({ color = 'white', size = 15 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5v14l11-7z" fill={color} />
    </Svg>
  );
}

/** Small info glyph for the "match fact" callout. */
function InfoIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
      <Path d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
    </Svg>
  );
}

function openVideo(url: string | null | undefined) {
  if (!url) return;
  // The app does not bundle expo-web-browser — open the embed in the OS browser.
  Linking.openURL(url).catch(() => {});
}

export function GameEditorialBlock({
  editorial,
  gallery,
}: {
  editorial: MatchEditorial | null;
  gallery: MatchGalleryPhoto[];
}) {
  const { brand } = useTheme();

  if (!editorial && gallery.length === 0) return null;

  const hasRecap = !!editorial?.recapVideoEmbedUrl;
  const hasFull = !!editorial?.fullMatchEmbedUrl;
  const hasReport = !!(editorial?.reportTitleHe || editorial?.reportHe);

  return (
    <View style={{ gap: 12 }}>
      {/* Match fact callout */}
      {editorial?.matchFactHe ? (
        <Card>
          <View style={{ flexDirection: rtlRow(), alignItems: 'flex-start', gap: 10 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: theme.ink[100],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <InfoIcon color={brand.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: brand.accent,
                  textAlign: 'right',
                  marginBottom: 3,
                  letterSpacing: 0.2,
                }}
              >
                פקט מהמשחק
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: theme.ink[900],
                  writingDirection: 'rtl',
                  textAlign: 'right',
                  lineHeight: 22,
                }}
              >
                {editorial.matchFactHe}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Video buttons — recap (primary) + full match (secondary) */}
      {hasRecap || hasFull ? (
        <View style={{ flexDirection: rtlRow(), gap: 8, marginHorizontal: 16 }}>
          {hasRecap ? (
            <Pressable
              onPress={() => openVideo(editorial?.recapVideoEmbedUrl)}
              style={{
                flex: 1,
                flexDirection: rtlRow(),
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: brand.accent,
                borderRadius: 12,
                paddingVertical: 11,
                paddingHorizontal: 12,
              }}
            >
              <PlayIcon color="white" />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>תקציר וידאו</Text>
            </Pressable>
          ) : null}
          {hasFull ? (
            <Pressable
              onPress={() => openVideo(editorial?.fullMatchEmbedUrl)}
              style={{
                flex: 1,
                flexDirection: rtlRow(),
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: 'white',
                borderWidth: 1.5,
                borderColor: brand.accent,
                borderRadius: 12,
                paddingVertical: 11,
                paddingHorizontal: 12,
              }}
            >
              <PlayIcon color={brand.accent} />
              <Text style={{ color: brand.accent, fontSize: 13, fontWeight: '800' }}>המשחק המלא</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Written report */}
      {hasReport ? (
        <Card>
          {editorial?.reportTitleHe ? (
            <Text
              style={{
                fontSize: 15,
                fontWeight: '900',
                color: theme.ink[900],
                writingDirection: 'rtl',
                textAlign: 'right',
                marginBottom: editorial?.reportHe ? 8 : 0,
              }}
            >
              {editorial.reportTitleHe}
            </Text>
          ) : null}
          {editorial?.reportHe ? (
            <Text
              style={{
                fontSize: 13.5,
                color: theme.ink[700],
                writingDirection: 'rtl',
                textAlign: 'right',
                lineHeight: 26,
              }}
            >
              {editorial.reportHe}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {/* Photo strip */}
      {gallery.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '900',
              color: theme.ink[900],
              textAlign: 'right',
              writingDirection: 'rtl',
              marginHorizontal: 16,
            }}
          >
            תמונות מהמשחק
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {gallery.map((photo) => {
              const uri = absoluteImage(photo.url);
              if (!uri) return null;
              return (
                <View key={photo.id} style={{ width: 140 }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 140, height: 100, borderRadius: 12, backgroundColor: theme.ink[100] }}
                  />
                  {photo.title ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 11,
                        color: theme.ink[500],
                        writingDirection: 'rtl',
                        textAlign: 'right',
                        marginTop: 4,
                      }}
                    >
                      {photo.title}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

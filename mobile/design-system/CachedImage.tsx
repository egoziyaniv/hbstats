/**
 * CachedImage — drop-in replacement for React Native's <Image>, backed by
 * expo-image so logo/photo URLs are cached aggressively on disk and across
 * app restarts. We use `cachePolicy: 'memory-disk'` (default for expo-image)
 * and a tiny crossfade so swapping between screens doesn't flash.
 *
 * Accepts the same `source={{ uri }}` shape we already use, plus an
 * optional `style` prop. For `width`/`height` set on the style — same as
 * react-native's Image.
 */

import { Image as ExpoImage, ImageContentFit, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

interface CachedImageProps {
  source: { uri: string | undefined | null } | string | undefined | null;
  style?: StyleProp<ImageStyle>;
  className?: string;
  contentFit?: ImageContentFit;
  // Allow callers to switch to no transition for tiny inline icons.
  transition?: number;
}

export function CachedImage({ source, style, className, contentFit = 'cover', transition = 120 }: CachedImageProps) {
  const uri =
    typeof source === 'string' ? source : source && typeof source === 'object' ? source.uri : null;
  if (!uri) return null;
  return (
    <ExpoImage
      source={{ uri }}
      style={style}
      className={className}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transition}
    />
  );
}

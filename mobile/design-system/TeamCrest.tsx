/**
 * TeamCrest — the single team-badge component. Renders the real club crest only
 * when logos are enabled (SHOW_TEAM_LOGOS); otherwise a Hebrew/Latin initials
 * monogram on a deterministic color. Pass `name` and it derives both the
 * initials and the color; `mono`/`bg`/`fg` override when you need a fixed look.
 */

import { View, Text, Image, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { absoluteImage } from '@/lib/config';
import { SHOW_TEAM_LOGOS, teamInitials, teamBadgeColor } from '@/lib/teamBadge';

interface TeamCrestProps {
  /** Team name — used to derive the monogram + color when not overridden. */
  name?: string | null;
  /** Background block color. Defaults to a deterministic color from `name`. */
  bg?: string;
  /** Foreground text color for the monogram. */
  fg?: string;
  /** Explicit monogram override (else derived from `name`). */
  mono?: string;
  /** Diameter/side length in px. */
  size?: number;
  /** Override border radius (defaults to size * 0.22 — soft rounded square). */
  radius?: number;
  /** Real crest URL — rendered only when SHOW_TEAM_LOGOS is true. */
  logoUrl?: string | null;
  /** Extra layout style (margins etc.) merged onto the badge/image. */
  style?: StyleProp<ViewStyle>;
}

export function TeamCrest({ name, bg, fg = '#ffffff', mono, size = 28, radius, logoUrl, style }: TeamCrestProps) {
  const r = radius ?? size * 0.22;

  const resolvedLogo = SHOW_TEAM_LOGOS ? absoluteImage(logoUrl) : undefined;
  if (resolvedLogo) {
    return (
      <Image
        source={{ uri: resolvedLogo }}
        style={[{ width: size, height: size, borderRadius: r, backgroundColor: bg ?? 'transparent' }, style as StyleProp<ImageStyle>]}
      />
    );
  }

  const text = mono ?? teamInitials(name);
  const badgeBg = bg ?? teamBadgeColor(name);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: badgeBg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.34 }}>{text}</Text>
    </View>
  );
}

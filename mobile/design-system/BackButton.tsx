/**
 * BackButton — circular back arrow used on detail screens. The hero gradient
 * sits above the status bar so the arrow needs a clear hit target with its own
 * background; previously it was just a 22px stroke nudged under the notch.
 *
 * Always render inside a parent that has `paddingTop: insets.top + 8` so the
 * arrow doesn't get clipped by the iPhone notch / dynamic island.
 */

import { Pressable } from 'react-native';
import { Svg, Path } from 'react-native-svg';

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {/* Arrow head pointing right (back in RTL = forward visually) */}
        <Path d="M9 6l6 6-6 6" />
      </Svg>
    </Pressable>
  );
}

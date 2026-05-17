/**
 * BottomNav — fixed bar at the bottom of detail screens that mirrors the
 * main tab bar (home / standings / players / live / settings). Detail
 * routes live outside the (tabs) group so Expo Router hides the tabs
 * navigator there; this component reinstates them as a persistent footer.
 */

import { View, Text, Pressable } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { rtlRow } from '@/lib/rtl';
import { theme } from './theme';

type IconProps = { color: string };

function HomeIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l9-7 9 7M5 10v10h14V10" />
    </Svg>
  );
}
function TableIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16v4H4zM4 12h16v4H4zM4 20h16" />
    </Svg>
  );
}
function PlayersIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </Svg>
  );
}
function LiveIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M5 12a7 7 0 0114 0M2 12a10 10 0 0120 0" />
    </Svg>
  );
}
function GearIcon({ color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

const TABS = [
  { id: 'home',        label: 'בית',     route: '/(tabs)' as const,             Icon: HomeIcon },
  { id: 'standings',   label: 'טבלה',    route: '/(tabs)/standings' as const,   Icon: TableIcon },
  { id: 'players',     label: 'שחקנים',  route: '/(tabs)/players' as const,     Icon: PlayersIcon },
  { id: 'live',        label: 'חי',      route: '/(tabs)/live' as const,        Icon: LiveIcon },
  { id: 'preferences', label: 'הגדרות',  route: '/(tabs)/preferences' as const, Icon: GearIcon },
];

export function BottomNav() {
  const router = useRouter();
  const { brand } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: rtlRow(),
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: theme.ink[200],
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 6,
      }}
    >
      {TABS.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => router.push(t.route as never)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}
        >
          <t.Icon color={theme.ink[500]} />
          <Text style={{ marginTop: 2, fontSize: 10.5, fontWeight: '600', color: theme.ink[500] }}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

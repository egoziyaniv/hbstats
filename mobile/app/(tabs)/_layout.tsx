import { Tabs } from 'expo-router';
import { Svg, Path, Circle } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from '@/design-system/theme';

type IconProps = { color: string; focused: boolean };

function HomeIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l9-7 9 7M5 10v10h14V10" />
    </Svg>
  );
}
function TableIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16v4H4zM4 12h16v4H4zM4 20h16" />
    </Svg>
  );
}
function MatchesIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" />
      <Path d="M3 12h18M12 3v18" />
    </Svg>
  );
}
function PlayersIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </Svg>
  );
}
function LiveIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M5 12a7 7 0 0114 0M2 12a10 10 0 0120 0" />
    </Svg>
  );
}
function GearIcon({ color }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Svg>
  );
}

export default function TabsLayout() {
  const { brand } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.accent,
        tabBarInactiveTintColor: theme.ink[500],
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopColor: theme.ink[200],
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'בית', tabBarIcon: HomeIcon }} />
      <Tabs.Screen name="games" options={{ title: 'משחקים', tabBarIcon: MatchesIcon }} />
      <Tabs.Screen name="standings" options={{ title: 'טבלה', tabBarIcon: TableIcon }} />
      <Tabs.Screen name="players" options={{ title: 'שחקנים', tabBarIcon: PlayersIcon }} />
      <Tabs.Screen name="live" options={{ title: 'חי', tabBarIcon: LiveIcon }} />
      <Tabs.Screen name="preferences" options={{ title: 'הגדרות', tabBarIcon: GearIcon }} />
    </Tabs>
  );
}

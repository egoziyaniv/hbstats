/**
 * SideMenu — slide-in drawer triggered by the header hamburger. Lists the
 * main app destinations. Pressing an item closes the drawer and navigates.
 */
import { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, Animated, Dimensions, I18nManager } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

interface MenuItem {
  label: string;
  path: string;
  icon: string;
}

const ITEMS: MenuItem[] = [
  { label: 'בית', path: '/', icon: '🏠' },
  { label: 'משחקים', path: '/games' as any, icon: '⚽' },
  { label: 'טבלה', path: '/standings', icon: '📊' },
  { label: 'שחקנים', path: '/players', icon: '👥' },
  { label: 'משחקים חיים', path: '/live', icon: '🔴' },
  { label: 'חדשות', path: '/news', icon: '📰' },
  { label: 'תחזיות', path: '/predictions', icon: '🎯' },
  { label: 'סטטיסטיקה מתקדמת', path: '/advanced-stats', icon: '📈' },
  { label: 'העדפות', path: '/preferences', icon: '⚙️' },
];

export function SideMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  const { user, logout } = useAuth();
  const width = Dimensions.get('window').width * 0.82;
  // In RTL, positive translateX moves LEFT, so the off-screen position is
  // -width (drawer hides past the right edge). In LTR it's +width.
  const closedX = I18nManager.isRTL ? -width : width;
  const slide = useRef(new Animated.Value(closedX)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : closedX,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide, closedX]);

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 180);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            // Use the logical "start" edge (= right in RTL, left in LTR) so
            // the drawer always docks on the visual right side of the screen.
            ...(I18nManager.isRTL ? { left: 0 } : { right: 0 }),
            width,
            backgroundColor: 'white',
            transform: [{ translateX: slide }],
            paddingTop: insets.top + 16,
            paddingHorizontal: 16,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowOffset: { width: -4, height: 0 },
            shadowRadius: 12,
          }}
          // Stop touches inside the panel from closing the overlay.
          onStartShouldSetResponder={() => true}
        >
          <View style={{ flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.ink[900] }}>StatsAI</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: theme.ink[500] }}>×</Text>
            </Pressable>
          </View>

          {ITEMS.map((item) => (
            <Pressable
              key={item.path}
              onPress={() => go(item.path)}
              style={({ pressed }) => ({
                flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 6,
                borderBottomWidth: 1,
                borderBottomColor: theme.ink[100],
                backgroundColor: pressed ? theme.ink[50] : 'transparent',
              })}
            >
              {/* Icon — pinned to the visual right via row direction */}
              <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.icon}</Text>
              {/* Label — wrapped in a View so flex:1 has an explicit container */}
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }}>
                  {item.label}
                </Text>
              </View>
            </Pressable>
          ))}

          <View style={{ height: 24 }} />

          {user ? (
            <Pressable
              onPress={async () => { await logout(); onClose(); router.replace('/auth/login' as any); }}
              style={{ paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12, backgroundColor: theme.ink[100], alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[700] }}>התנתק ({user.email})</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => go('/auth/login')}
              style={{ paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12, backgroundColor: brand.accent, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>התחבר</Text>
            </Pressable>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

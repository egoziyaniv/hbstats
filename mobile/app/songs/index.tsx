import { useState } from 'react';
import { ScrollView, View, Text, Image, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Svg, Path } from 'react-native-svg';
import { rtlRow } from '@/lib/rtl';
import { useSongs } from '@/hooks/useSongs';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TabBar } from '@/design-system/TabBar';
import { theme } from '@/design-system/theme';
import type { SongSummary, SongType } from '@shared/types/mobile-api';

const TYPE_HE: Record<SongType, string> = {
  STAND: 'שיר יציע',
  PLAYER: 'שיר שחקן',
  STUDIO: 'שיר אולפן',
  CHAMPIONSHIP: 'שיר אליפות',
};

const TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'STAND', label: TYPE_HE.STAND },
  { id: 'PLAYER', label: TYPE_HE.PLAYER },
  { id: 'STUDIO', label: TYPE_HE.STUDIO },
  { id: 'CHAMPIONSHIP', label: TYPE_HE.CHAMPIONSHIP },
];

function MusicNote({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18V5l12-2v13" />
      <Path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <Path d="M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </Svg>
  );
}

function TypeChip({ type }: { type: SongType }) {
  const { brand } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: brand.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: brand.accent, fontSize: 10.5, fontWeight: '800' }}>{TYPE_HE[type]}</Text>
    </View>
  );
}

function SongCard({ song, onPress }: { song: SongSummary; onPress: () => void }) {
  const { brand } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 12 }}>
          {song.thumbUrl ? (
            <Image
              source={{ uri: song.thumbUrl }}
              style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: theme.ink[100] }}
            />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center' }}>
              <MusicNote color={brand.accent} />
            </View>
          )}
          <View style={{ flex: 1, alignItems: 'flex-start', gap: 4 }}>
            <TypeChip type={song.type} />
            <Text style={{ color: theme.ink[900], fontSize: 15, fontWeight: '800', textAlign: 'right' }} numberOfLines={2}>
              {song.titleHe}
            </Text>
            {song.performerGroup ? (
              <Text style={{ color: theme.ink[500], fontSize: 12.5, fontWeight: '500', textAlign: 'right' }} numberOfLines={1}>
                {song.performerGroup}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function SongsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const [tab, setTab] = useState<string>('all');
  const type = tab === 'all' ? undefined : (tab as SongType);
  const { data, isLoading, refetch, isRefetching } = useSongs(type);

  const songs = data?.songs ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="שירים" />
      <TabBar items={TABS} value={tab} onChange={setTab} />

      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : songs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: brand.accentGlow, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <MusicNote color={brand.accent} size={30} />
          </View>
          <Text style={{ color: theme.ink[900], fontSize: 16, fontWeight: '800', textAlign: 'center' }}>
            אין שירים להצגה
          </Text>
          <Text style={{ color: theme.ink[500], fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            נסו קטגוריה אחרת.
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ paddingVertical: 16, gap: 12, paddingBottom: 32 }}
        >
          {songs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              onPress={() => router.push(('/songs/' + encodeURIComponent(song.slug)) as any)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

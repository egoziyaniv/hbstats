/**
 * GameRatingSheet — modal overlay for user-submitted per-player ratings on
 * a game. Mirrors the web GameRatingForm shape: dropdown 1.0-10.0 per
 * player, with a "save" button that submits via POST /api/games/:id/rate.
 *
 * We persist via the same auth flow the rest of the mobile app uses
 * (bearer token, auto-refresh). Anonymous users see ratings + averages but
 * are bumped to the login screen if they try to save.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { CachedImage } from '@/design-system/CachedImage';
import { absoluteImage } from '@/lib/config';
import { theme } from '@/design-system/theme';

interface Player {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  jerseyNumber: number | null;
  position: string | null;
  side: 'home' | 'away';
}

interface AverageMap { [playerId: string]: { avg: number; count: number } }

const RATING_OPTIONS = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5);

export function GameRatingSheet({
  visible,
  onClose,
  gameId,
  homeTeamName,
  awayTeamName,
  players,
}: {
  visible: boolean;
  onClose: () => void;
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  players: Player[];
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [averages, setAverages] = useState<AverageMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    apiClient
      .get<{ ratings: Record<string, number>; averages: AverageMap }>(`/api/games/${gameId}/rate`)
      .then((data: { ratings?: Record<string, number>; averages?: AverageMap }) => {
        setRatings(data.ratings || {});
        setAverages(data.averages || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, gameId]);

  const save = async () => {
    if (!user) {
      onClose();
      router.push('/auth/login' as any);
      return;
    }
    setSaving(true);
    try {
      const payload = Object.entries(ratings).map(([playerId, rating]) => ({ playerId, rating }));
      await apiClient.post(`/api/games/${gameId}/rate`, { ratings: payload });
      const refreshed = await apiClient.get<{ averages: AverageMap }>(`/api/games/${gameId}/rate`);
      setAverages(refreshed.averages || {});
    } catch (e) { /* ignore */ }
    finally { setSaving(false); }
  };

  const renderPlayer = (p: Player) => {
    const value = ratings[p.playerId];
    const avg = averages[p.playerId];
    return (
      <Pressable
        key={p.playerId}
        onPress={() => setPickerFor(pickerFor === p.playerId ? null : p.playerId)}
        style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#F5F4EF', borderRadius: 8, marginBottom: 6 }}
      >
        {absoluteImage(p.photoUrl) ? (
          <CachedImage source={{ uri: absoluteImage(p.photoUrl)! }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#ddd' }} />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#ddd', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#666' }}>{p.displayName.slice(0, 2)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', textAlign: 'right', color: '#222' }}>
            {p.jerseyNumber ? `${p.jerseyNumber}. ` : ''}{p.displayName}
          </Text>
          {p.position ? (
            <Text style={{ fontSize: 10, color: '#777', textAlign: 'right' }}>{p.position}</Text>
          ) : null}
        </View>
        {avg && avg.count > 0 ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#333' }}>{avg.avg.toFixed(1)}</Text>
            <Text style={{ fontSize: 8, color: '#999' }}>{avg.count} מדרגים</Text>
          </View>
        ) : null}
        <View style={{ minWidth: 50, height: 32, paddingHorizontal: 8, borderRadius: 8, backgroundColor: value != null ? theme.accent : '#E0DED7', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: value != null ? 'white' : '#888' }}>
            {value != null ? value.toFixed(1) : '—'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const home = players.filter((p) => p.side === 'home');
  const away = players.filter((p) => p.side === 'away');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'white' }}>
        <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Pressable onPress={onClose} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#666' }}>סגור</Text>
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '900' }}>⭐ נקד את המשחק</Text>
          <Pressable
            onPress={save}
            disabled={saving || !user}
            style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: theme.accent, borderRadius: 999, opacity: saving || !user ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '900', color: 'white' }}>
              {saving ? 'שומר...' : !user ? 'התחבר' : 'שמור'}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '900', marginBottom: 8, textAlign: 'right' }}>{homeTeamName}</Text>
            {home.map(renderPlayer)}
            <Text style={{ fontSize: 14, fontWeight: '900', marginBottom: 8, marginTop: 16, textAlign: 'right' }}>{awayTeamName}</Text>
            {away.map(renderPlayer)}
          </ScrollView>
        )}

        {pickerFor ? (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', padding: 16, maxHeight: 280 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 8, textAlign: 'right' }}>בחר ציון:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: rtlRow(), gap: 4 }}>
                {[null, ...RATING_OPTIONS].map((v) => (
                  <Pressable
                    key={String(v)}
                    onPress={() => {
                      setRatings((prev) => ({ ...prev, [pickerFor]: v }));
                      setPickerFor(null);
                    }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
                      backgroundColor: ratings[pickerFor] === v ? theme.accent : '#f0f0eb',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '800', color: ratings[pickerFor] === v ? 'white' : '#333' }}>
                      {v == null ? '—' : v.toFixed(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

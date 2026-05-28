/**
 * PlayerMatchStatsSheet — bottom-sheet modal that shows per-match player stats
 * (rating, shots, key passes, duels, dribbles) fetched from API-Football.
 * Mirrors the web's PlayerMatchStatsModal but uses RN Modal + theme accent.
 */

import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { CachedImage } from '@/design-system/CachedImage';
import { absoluteImage } from '@/lib/config';
import { theme } from './theme';
import type { MatchPlayerStats } from '@shared/types/mobile-api';

function ratingColor(rating: number | null): string {
  if (rating == null) return '#a8a29e';
  if (rating >= 8) return '#059669';
  if (rating >= 7) return '#d97706';
  if (rating >= 6) return '#78716c';
  return '#dc2626';
}

function pctText(success: number | null, total: number | null) {
  if (success == null || total == null || total === 0) return null;
  return `${success}/${total} (${Math.round((success / total) * 100)}%)`;
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}>
      <Text style={{ color: theme.ink[700], fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.ink[900], fontSize: 13, fontWeight: '700' }}>{String(value)}</Text>
    </View>
  );
}

export function PlayerMatchStatsSheet({
  open,
  onClose,
  stats,
  loading,
  playerLabel,
  playerPhoto,
}: {
  open: boolean;
  onClose: () => void;
  stats: MatchPlayerStats | null | undefined;
  loading: boolean;
  playerLabel?: string | null;
  playerPhoto?: string | null;
}) {
  const { brand } = useTheme();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          style={{
            backgroundColor: theme.canvas.start,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
            overflow: 'hidden',
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: brand.accent }}>
            {playerPhoto && absoluteImage(playerPhoto) ? (
              <CachedImage source={{ uri: absoluteImage(playerPhoto) }} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'white', fontSize: 18, fontWeight: '900' }}>{(playerLabel || stats?.name || '?').slice(0, 1)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'white', fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{playerLabel || stats?.name || 'שחקן'}</Text>
              {stats?.position ? (
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                  {stats.position}{stats.captain ? ' · קפטן' : ''}{stats.substitute ? ' · החליף' : ''}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 26, lineHeight: 28 }}>×</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={brand.accent} style={{ padding: 32 }} />
          ) : !stats ? (
            <View style={{ padding: 32 }}>
              <Text style={{ textAlign: 'center', color: theme.ink[500], fontSize: 13 }}>אין נתונים מפורטים זמינים לשחקן זה במשחק זה.</Text>
            </View>
          ) : (
            <ScrollView style={{ flexGrow: 0 }}>
              {/* Top stat strip */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.ink[200], backgroundColor: theme.ink[50] }}>
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: theme.ink[900] }}>
                    {stats.minutes ?? '—'}{stats.minutes != null ? "'" : ''}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[500], letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>דקות</Text>
                </View>
                {stats.rating != null ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
                    <View style={{ height: 40, width: 56, borderRadius: 8, backgroundColor: ratingColor(stats.rating), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: 'white', fontSize: 17, fontWeight: '900' }}>{stats.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              <Section title="תקיפה">
                <Row label="שערים" value={stats.goals} />
                <Row label="בישולים" value={stats.assists} />
                <Row label="בעיטות" value={pctText(stats.shots.on, stats.shots.total)} />
                <Row label="דריבלים מוצלחים" value={pctText(stats.dribbles.success, stats.dribbles.attempts)} />
              </Section>
              <Section title="משחק קישור">
                <Row label="מסירות מפתח" value={stats.passes.key} />
                <Row label="סך מסירות" value={stats.passes.total} />
                <Row label="דיוק מסירות" value={stats.passes.accuracy != null ? `${stats.passes.accuracy}%` : null} />
              </Section>
              <Section title="הגנה ועוצמה">
                <Row label="חטיפות" value={stats.tackles.total} />
                <Row label="יירוטים" value={stats.tackles.interceptions} />
                <Row label="דו-קרבות" value={pctText(stats.duels.won, stats.duels.total)} />
                <Row label="עבירות" value={stats.fouls.committed != null && stats.fouls.drawn != null ? `${stats.fouls.committed} ביצע / ${stats.fouls.drawn} עליו` : null} />
              </Section>
              {(stats.cards.yellow || stats.cards.red) ? (
                <Section title="כרטיסים">
                  <Row label="צהוב" value={stats.cards.yellow} />
                  <Row label="אדום" value={stats.cards.red} />
                </Section>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.ink[100] }}>
      <Text style={{ fontSize: 10, fontWeight: '900', color: theme.ink[500], letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{title}</Text>
      {children}
    </View>
  );
}

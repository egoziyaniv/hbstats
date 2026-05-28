/**
 * PlayerMatchHistorySection — bar chart of ratings over last 15 matches +
 * compact table of per-match stats. Mobile mirror of web PlayerMatchHistory.
 */

import { View, Text } from 'react-native';
import { Svg, Rect, Line, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { theme } from './theme';
import type { PlayerMatchHistoryEntry } from '@shared/types/mobile-api';

function ratingFill(rating: number): string {
  if (rating >= 8) return '#059669';
  if (rating >= 7) return '#d97706';
  if (rating >= 6) return '#78716c';
  return '#dc2626';
}

function RatingChart({ entries }: { entries: PlayerMatchHistoryEntry[] }) {
  const data = [...entries].reverse().slice(-15);
  const W = 320;
  const H = 160;
  const padL = 24, padR = 8, padT = 8, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = data.length > 0 ? Math.max(8, innerW / data.length - 4) : 0;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[2, 4, 6, 8, 10].map((y) => {
        const yPx = padT + innerH - (y / 10) * innerH;
        return (
          <>
            <Line key={`grid-${y}`} x1={padL} x2={W - padR} y1={yPx} y2={yPx} stroke="#e7e5e4" strokeDasharray="3 3" />
            <SvgText key={`lbl-${y}`} x={padL - 4} y={yPx + 3} fontSize="8" fill="#a8a29e" textAnchor="end">{y}</SvgText>
          </>
        );
      })}
      {data.map((e, i) => {
        const r = e.rating ?? 0;
        const h = (r / 10) * innerH;
        const x = padL + i * (innerW / data.length) + (innerW / data.length - barW) / 2;
        const y = padT + innerH - h;
        return (
          <Rect
            key={`bar-${e.gameId}-${i}`}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={3}
            fill={e.rating != null ? ratingFill(e.rating) : '#d6d3d1'}
          />
        );
      })}
    </Svg>
  );
}

export function PlayerMatchHistorySection({ entries }: { entries: PlayerMatchHistoryEntry[] }) {
  const router = useRouter();
  if (entries.length === 0) {
    return <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center', padding: 16 }}>אין נתונים מפורטים פר-משחק לשחקן זה.</Text>;
  }
  return (
    <View>
      <RatingChart entries={entries} />
      <View style={{ marginTop: 8, gap: 6 }}>
        {entries.slice(0, 12).map((e) => (
          <Pressable
            key={e.gameId}
            onPress={() => router.push(`/games/${e.gameId}` as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}
          >
            <View style={{ width: 56 }}>
              <Text style={{ fontSize: 10, color: theme.ink[500] }} dir="ltr">{e.date.slice(5)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: theme.ink[900], fontWeight: '500' }} numberOfLines={1}>{e.opponent}</Text>
              {e.scoreLine ? <Text style={{ fontSize: 10, color: theme.ink[500] }} dir="ltr">{e.scoreLine}</Text> : null}
            </View>
            {e.rating != null ? (
              <View style={{ width: 36, height: 22, borderRadius: 4, backgroundColor: ratingFill(e.rating), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '900' }}>{e.rating.toFixed(1)}</Text>
              </View>
            ) : <View style={{ width: 36 }} />}
            <View style={{ width: 28, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: theme.ink[700] }}>{e.minutes ?? '—'}'</Text>
            </View>
            <View style={{ width: 30, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: theme.ink[900], fontWeight: '700' }}>
                {e.goals ? `⚽${e.goals}` : ''}{e.assists ? ` 🅰${e.assists}` : ''}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

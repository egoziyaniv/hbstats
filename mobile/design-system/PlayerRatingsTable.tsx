/**
 * PlayerRatingsTable (mobile) — per-player FotMob ratings + xG/xA. Both teams,
 * sorted by rating; team shown by a colour dot. Compact two-line rows.
 */
import { View, Text } from 'react-native';
import { theme } from './theme';
import type { FotmobPlayerRating } from '@shared/types/mobile-api';

const HOME = '#e11d48';
const AWAY = '#2563eb';

function ratingBg(r: number) {
  if (r >= 8) return '#2563eb';
  if (r >= 7) return '#10b981';
  if (r >= 6) return '#f59e0b';
  return '#f97316';
}
const n2 = (v: number | null) => (v == null ? '—' : v.toFixed(2));

export function PlayerRatingsTable({ players }: { players: FotmobPlayerRating[]; homeName?: string; awayName?: string }) {
  if (!players || players.length === 0) return null;
  const rows = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const top = rows[0]?.rating ?? 0;

  return (
    <View>
      {rows.map((p, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 9,
            borderBottomWidth: i === rows.length - 1 ? 0 : 1,
            borderBottomColor: theme.ink[100],
          }}
        >
          {/* rating badge */}
          <View
            style={{
              minWidth: 40,
              alignItems: 'center',
              borderRadius: 6,
              paddingVertical: 3,
              paddingHorizontal: 6,
              backgroundColor: p.rating != null ? ratingBg(p.rating) : theme.ink[200],
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>
              {p.rating != null ? p.rating.toFixed(1) : '—'}{p.rating != null && p.rating === top && top >= 7 ? ' ★' : ''}
            </Text>
          </View>

          {/* name + compact stats (RTL: name on the right) */}
          <View style={{ flex: 1, marginRight: 10, alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontWeight: '700', color: theme.ink[900], fontSize: 13 }} numberOfLines={1}>
                {p.name}{p.isGK ? ' (ש)' : ''}
              </Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.isHome ? HOME : AWAY }} />
            </View>
            <Text style={{ color: theme.ink[500], fontSize: 11, marginTop: 2 }}>
              {p.minutes != null ? `${p.minutes}′` : ''}
              {p.goals ? ` · ${p.goals}⚽` : ''}
              {p.assists ? ` · ${p.assists}🅰` : ''}
              {` · xG ${n2(p.xg)} · xA ${n2(p.xa)}`}
              {p.defActions != null ? ` · הגנה ${p.defActions}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

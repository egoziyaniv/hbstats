/**
 * MatchInfoCard (mobile) — venue / attendance / surface / weather from FotMob.
 * Renders only present fields.
 */
import { View, Text } from 'react-native';
import { theme } from './theme';
import type { FotmobMatchInfo } from '@shared/types/mobile-api';

const SURFACE_HE: Record<string, string> = { grass: 'דשא טבעי', 'artificial turf': 'דשא סינתטי', artificial: 'דשא סינתטי', hybrid: 'דשא היברידי' };
const weatherHe = (d?: string | null) => {
  if (!d) return null;
  const s = d.toLowerCase();
  if (s.includes('clear') || s.includes('sun')) return 'בהיר';
  if (s.includes('cloud')) return 'מעונן';
  if (s.includes('rain') || s.includes('drizzle')) return 'גשום';
  if (s.includes('snow')) return 'שלג';
  if (s.includes('fog') || s.includes('mist')) return 'ערפילי';
  return d;
};
const weatherEmoji = (d?: string | null) => {
  if (!d) return '🌡️';
  const s = d.toLowerCase();
  if (s.includes('clear') || s.includes('sun')) return '☀️';
  if (s.includes('cloud')) return '☁️';
  if (s.includes('rain') || s.includes('drizzle')) return '🌧️';
  if (s.includes('snow')) return '❄️';
  if (s.includes('fog') || s.includes('mist')) return '🌫️';
  return '🌡️';
};

export function MatchInfoCard({ info }: { info: FotmobMatchInfo }) {
  if (!info) return null;
  const st = info.stadium || {};
  const cap = st.capacity ?? null;
  const att = info.attendance ?? null;
  const pct = cap && att ? Math.round((att / cap) * 100) : null;
  const surface = st.surface ? (SURFACE_HE[st.surface.toLowerCase()] || st.surface) : null;
  const w = info.weather;
  if (!(st.name || att != null || surface || w)) return null;

  return (
    <View style={{ gap: 14 }}>
      {st.name ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontWeight: '900', color: theme.ink[900], fontSize: 15 }}>{st.name}</Text>
          {(st.city || st.country) ? <Text style={{ color: theme.ink[500], fontSize: 12 }}>{[st.city, st.country].filter(Boolean).join(', ')}</Text> : null}
        </View>
      ) : null}

      {(cap != null || att != null) ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.ink[700], fontSize: 13 }}>קיבולת <Text style={{ fontWeight: '800', color: theme.ink[900] }}>{cap != null ? cap.toLocaleString('he-IL') : '—'}</Text></Text>
            <Text style={{ color: theme.ink[700], fontSize: 13 }}>נוכחות <Text style={{ fontWeight: '800', color: theme.ink[900] }}>{att != null ? att.toLocaleString('he-IL') : '—'}</Text></Text>
          </View>
          {pct != null ? (
            <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.ink[200], overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min(pct, 100)}%`, backgroundColor: '#10b981', borderRadius: 5 }} />
              <Text style={{ position: 'absolute', left: 6, top: -1, fontSize: 9, fontWeight: '900', color: theme.ink[700] }}>{pct}%</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'flex-end' }}>
        {surface ? <Text style={{ color: theme.ink[700], fontSize: 13 }}>משטח <Text style={{ fontWeight: '800', color: theme.ink[900] }}>{surface}</Text></Text> : null}
        {w && (w.temperature != null || w.description) ? (
          <Text style={{ color: theme.ink[700], fontSize: 13 }}>
            מזג אוויר <Text style={{ fontWeight: '800', color: theme.ink[900] }}>{w.temperature != null ? `${w.temperature}°C ` : ''}{weatherHe(w.description) || ''}</Text> {weatherEmoji(w.description)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

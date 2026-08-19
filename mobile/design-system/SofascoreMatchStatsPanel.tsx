/**
 * SofascoreMatchStatsPanel — mobile mirror of the web component. Renders
 * ~40 per-match metrics grouped by Sofascore section (Shots / Attack /
 * Passes / Duels / Defending / Goalkeeping). Each row: away · label · home,
 * matching home-on-right convention used everywhere else in the RTL layout.
 */

import { View, Text } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import type { SofascoreMatchStat } from '@shared/types/mobile-api';
import { theme } from './theme';

const SECTION_HE: Record<string, string> = {
  Shots: 'בעיטות',
  Attack: 'התקפה',
  Passes: 'מסירות',
  Duels: 'דו-קרבים',
  Defending: 'הגנה',
  Goalkeeping: 'שוערים',
};

const LABEL_HE: Record<string, string> = {
  'Total shots': 'סך בעיטות',
  'Shots on target': 'בעיטות למסגרת',
  'Hit woodwork': 'פגיעה בקורה',
  'Shots off target': 'בעיטות מחוץ למסגרת',
  'Blocked shots': 'בעיטות חסומות',
  'Shots inside box': 'בעיטות מתוך הרחבה',
  'Shots outside box': 'בעיטות מחוץ לרחבה',
  'Big chances scored': 'מצבי שער ממומשים',
  'Big chances missed': 'מצבי שער מוחמצים',
  'Touches in opposition box': 'נגיעות ברחבה היריבה',
  'Fouled in final third': 'עבירות שספגו ב-1/3 האחרון',
  Offsides: 'נבדלים',
  Corners: 'קרנות',
  'Accurate passes': 'מסירות מדויקות',
  'Throw-ins': 'הכנסות',
  'Final third entries': 'כניסות ל-1/3 אחרון',
  'Passes in final third': 'מסירות ב-1/3 אחרון',
  'Long balls': 'כדורים ארוכים',
  Crosses: 'הרמות',
  Duels: 'דו-קרבים (אחוזי ניצחון)',
  Dispossessed: 'איבודי כדור',
  'Ground duels': 'דו-קרבים על הקרקע',
  'Aerial duels': 'דו-קרבים אוויריים',
  Dribbles: 'כדרורים',
  'Total tackles': 'סך גניבות',
  'Tackles won': 'גניבות מוצלחות',
  Interceptions: 'יירוטים',
  Recoveries: 'שחזורים',
  Clearances: 'הרחקות',
  'Errors leading to goal': 'טעויות שהובילו לשער',
  'Goalkeeper saves': 'הצלות שוער',
  'Big saves': 'הצלות גדולות',
  'High claims': 'תפיסות גבוהות',
  'Goal kicks': 'בעיטות שער',
};

function StatRow({ stat }: { stat: SofascoreMatchStat }) {
  const labelHe = LABEL_HE[stat.label] || stat.label;
  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.ink[100],
        backgroundColor: '#fafafa',
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginBottom: 4,
      }}
    >
      {/* HOME first + rtlRow() → home renders on the visual RIGHT under RTL,
          matching the legend and the rest of the app (games/[id] StatRow). The
          old hardcoded 'row' with away-first flipped every metric to the wrong side. */}
      <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: theme.ink[900] }}>{stat.home}</Text>
          {stat.homeExtra ? (
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[500] }}>{stat.homeExtra}</Text>
          ) : null}
        </View>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: theme.ink[700] }}>
          {labelHe}
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: theme.ink[900] }}>{stat.away}</Text>
          {stat.awayExtra ? (
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink[500] }}>{stat.awayExtra}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function SofascoreMatchStatsPanel({ stats }: { stats: SofascoreMatchStat[] }) {
  if (!stats || stats.length === 0) return null;
  const sections = new Map<string, SofascoreMatchStat[]>();
  for (const s of stats) {
    if (!sections.has(s.section)) sections.set(s.section, []);
    sections.get(s.section)!.push(s);
  }
  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }}>
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#c7d2fe',
          backgroundColor: '#eef2ff',
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontSize: 11, color: '#3730a3', textAlign: 'center' }}>
          שמאל = קבוצת חוץ · ימין = קבוצת בית
        </Text>
      </View>
      {Array.from(sections.entries()).map(([section, rows]) => (
        <View key={section}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: theme.ink[900], marginBottom: 6 }}>
            {SECTION_HE[section] || section}
          </Text>
          {rows.map((s) => <StatRow key={s.label} stat={s} />)}
        </View>
      ))}
    </View>
  );
}

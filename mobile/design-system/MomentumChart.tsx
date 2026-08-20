/**
 * MomentumChart (mobile) — minute-by-minute momentum from FotMob. Positive =
 * home (red, above baseline), negative = away (blue, below). Goal markers on
 * the scoring side; dashed HT line. Mirror of the web component.
 */
import { View, Text, useWindowDimensions } from 'react-native';
import Svg, { Line, Path, Defs, LinearGradient, Stop, Circle, Text as SvgText, G } from 'react-native-svg';
import { theme } from './theme';
import type { FotmobMomentumPoint, FotmobGoalMarker } from '@shared/types/mobile-api';

const HOME = '#e11d48';
const AWAY = '#2563eb';
const Wd = 320;
const Ht = 96;
const PAD = 8;
const BASE = Ht / 2;

export function MomentumChart({ data, goals, homeName, awayName }: { data: FotmobMomentumPoint[]; goals?: FotmobGoalMarker[]; homeName: string; awayName: string }) {
  const { width } = useWindowDimensions();
  if (!data || data.length < 3) return null;
  const w = Math.max(280, width - 64);
  const h = w * ((Ht + 14) / Wd);

  const maxMin = Math.max(...data.map((d) => d.minute), 90);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const xOf = (m: number) => PAD + (m / maxMin) * (Wd - PAD * 2);
  const yOf = (v: number) => BASE - (v / maxAbs) * (BASE - 4);
  const pts = data.map((d) => `${xOf(d.minute).toFixed(1)},${yOf(d.value).toFixed(1)}`);
  const area = `M ${xOf(data[0].minute).toFixed(1)},${BASE} L ${pts.join(' L ')} L ${xOf(data[data.length - 1].minute).toFixed(1)},${BASE} Z`;
  const htX = xOf(45);
  const goalList = (goals || []).filter((g) => g.minute != null);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: HOME }} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[700] }}>{homeName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: AWAY }} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[700] }}>{awayName}</Text>
        </View>
      </View>
      <Svg width={w} height={h} viewBox={`0 0 ${Wd} ${Ht + 14}`}>
        <Defs>
          <LinearGradient id="mmg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={HOME} stopOpacity="0.95" />
            <Stop offset="49.9%" stopColor={HOME} stopOpacity="0.75" />
            <Stop offset="50%" stopColor={AWAY} stopOpacity="0.75" />
            <Stop offset="100%" stopColor={AWAY} stopOpacity="0.95" />
          </LinearGradient>
        </Defs>
        <Line x1={PAD} y1={BASE} x2={Wd - PAD} y2={BASE} stroke="#cbd5e1" strokeWidth={0.6} />
        <Path d={area} fill="url(#mmg)" />
        <Line x1={htX} y1={2} x2={htX} y2={Ht} stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="2,2" />
        {goalList.map((g, i) => {
          const gx = xOf(g.minute as number);
          const gy = g.isHome ? 9 : Ht - 9;
          return (
            <G key={i}>
              <Circle cx={gx} cy={gy} r={4.2} fill="#fff" stroke={g.isHome ? HOME : AWAY} strokeWidth={1} />
              <SvgText x={gx} y={gy + 2.6} textAnchor="middle" fontSize="5.5">⚽</SvgText>
            </G>
          );
        })}
        <SvgText x={PAD} y={Ht + 11} fontSize="7" fontWeight="700" fill="#64748b">0′</SvgText>
        <SvgText x={htX} y={Ht + 11} fontSize="7" fontWeight="700" fill="#64748b" textAnchor="middle">HT</SvgText>
        <SvgText x={Wd - PAD} y={Ht + 11} fontSize="7" fontWeight="700" fill="#64748b" textAnchor="end">FT</SvgText>
      </Svg>
    </View>
  );
}

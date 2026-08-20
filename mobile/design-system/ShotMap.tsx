/**
 * ShotMap (mobile) — full-pitch shot map from FotMob data. Home attacks right
 * (px 0-100). Colour = team, dot size ∝ xG. Mirror of the web component; no
 * hover on touch, so per-team summary carries the numbers.
 */
import { View, Text, useWindowDimensions } from 'react-native';
import Svg, { Rect, Line, Circle, G } from 'react-native-svg';
import { theme } from './theme';
import type { FotmobShot } from '@shared/types/mobile-api';

const HOME = '#e11d48';
const AWAY = '#2563eb';
const W = 105;
const H = 68;

function radius(xg: number | null, isGoal: boolean) {
  const base = 1.0 + (xg != null ? Math.min(xg, 0.9) * 2.4 : 0.4);
  return isGoal ? base + 0.5 : base;
}

export function ShotMap({ shots, homeName, awayName, homeXg, awayXg }: { shots: FotmobShot[]; homeName: string; awayName: string; homeXg: number | null; awayXg: number | null }) {
  const { width } = useWindowDimensions();
  if (!shots || shots.length === 0) return null;
  const w = Math.max(260, width - 64);
  const h = w * (H / W);

  const tally = (home: boolean) => {
    const t = shots.filter((s) => s.isHome === home);
    return { shots: t.length, on: t.filter((s) => s.outcome === 'goal' || s.outcome === 'save').length, goals: t.filter((s) => s.outcome === 'goal').length };
  };
  const th = tally(true);
  const ta = tally(false);
  const line = { stroke: 'rgba(255,255,255,0.5)', strokeWidth: 0.35 } as const;

  const Dot = (s: FotmobShot, i: number) => {
    const cx = (s.px / 100) * W;
    const cy = (s.py / 100) * H;
    const color = s.isHome ? HOME : AWAY;
    const isGoal = s.outcome === 'goal';
    const onTarget = isGoal || s.outcome === 'save';
    const r = radius(s.xg, isGoal);
    if (isGoal) {
      return (
        <G key={i}>
          <Circle cx={cx} cy={cy} r={r + 1.1} fill="none" stroke={color} strokeWidth={0.5} opacity={0.6} />
          <Circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={0.6} />
        </G>
      );
    }
    if (onTarget) return <Circle key={i} cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={0.4} opacity={0.95} />;
    if (s.outcome === 'block') return <Circle key={i} cx={cx} cy={cy} r={r} fill={color} opacity={0.4} />;
    return <Circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={0.7} opacity={0.85} />;
  };

  return (
    <View>
      {/* summary */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: AWAY }} />
          <Text style={{ fontWeight: '800', color: theme.ink[900], fontSize: 12 }}>{awayName}</Text>
          <Text style={{ color: theme.ink[500], fontSize: 11 }}>{ta.goals} ⚽ · {ta.on}/{ta.shots}{awayXg != null ? ` · xG ${awayXg.toFixed(2)}` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: theme.ink[500], fontSize: 11 }}>{homeXg != null ? `xG ${homeXg.toFixed(2)} · ` : ''}{th.on}/{th.shots} · {th.goals} ⚽</Text>
          <Text style={{ fontWeight: '800', color: theme.ink[900], fontSize: 12 }}>{homeName}</Text>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: HOME }} />
        </View>
      </View>

      <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: '#166534' }}>
        <Svg width={w} height={h} viewBox={`-2 -2 ${W + 4} ${H + 4}`}>
          <Rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" {...line} />
          <Line x1={W / 2} y1={0.5} x2={W / 2} y2={H - 0.5} {...line} />
          <Circle cx={W / 2} cy={H / 2} r={9.15} fill="none" {...line} />
          <Rect x={0.5} y={13.85} width={16.5} height={40.3} fill="none" {...line} />
          <Rect x={0.5} y={24.85} width={5.5} height={18.3} fill="none" {...line} />
          <Rect x={W - 0.5 - 16.5} y={13.85} width={16.5} height={40.3} fill="none" {...line} />
          <Rect x={W - 0.5 - 5.5} y={24.85} width={5.5} height={18.3} fill="none" {...line} />
          {shots.map((s, i) => Dot(s, i))}
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 10 }}>
        <Legend label="שער" fill="#9ca3af" ring />
        <Legend label="למסגרת" fill="#9ca3af" />
        <Legend label="החטאה" hollow />
        <Legend label="נחסמה" faded />
        <Text style={{ color: theme.ink[500], fontSize: 10 }}>גודל ∝ xG</Text>
      </View>
    </View>
  );
}

function Legend({ label, fill, ring, hollow, faded }: { label: string; fill?: string; ring?: boolean; hollow?: boolean; faded?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: hollow ? 'transparent' : faded ? 'rgba(156,163,175,0.4)' : fill, borderWidth: hollow || ring ? 2 : 0, borderColor: hollow ? '#9ca3af' : '#fff' }} />
      <Text style={{ color: theme.ink[700], fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

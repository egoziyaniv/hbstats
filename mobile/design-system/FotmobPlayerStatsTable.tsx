/**
 * FotmobPlayerStatsTable — per-player match-stats tables grouped into category
 * tabs (מדדים מובילים / התקפה / מסירות / הגנה / דו-קרבים / שוערים). Category
 * defs + Hebrew labels come from the shared @shared/fotmob-player-stats module
 * so web + mobile stay identical.
 *
 * Layout: for the selected category we render one table per team (home first →
 * visually on the RIGHT under RTL), each headed by the team name. The player
 * name column is FIXED on the start (right) side while the many stat columns
 * live in a horizontal ScrollView, so wide categories stay readable on phones.
 */

import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { PLAYER_STAT_CATEGORIES, labelHe, formatStatValue } from '@shared/fotmob-player-stats';
import type { FotmobPlayerRating } from '@shared/types/mobile-api';
import { theme } from './theme';
import { TabBar } from './TabBar';

const NAME_W = 116;
const COL_W = 62;
const HEADER_H = 34;
const ROW_H = 34;

/** True when at least one shown player has a value for this stat label. */
function hasData(label: string, list: FotmobPlayerRating[]): boolean {
  return list.some((p) => {
    const v = p.stats?.[label];
    return v !== undefined && v !== null && v !== '';
  });
}

/** Sort by rating desc; players without a rating fall to the bottom. */
function byRatingDesc(a: FotmobPlayerRating, b: FotmobPlayerRating): number {
  return (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
}

function TeamStatsTable({
  title,
  rows,
  cols,
}: {
  title: string;
  rows: FotmobPlayerRating[];
  cols: string[];
}) {
  if (rows.length === 0) return null;
  return (
    <View>
      <Text
        style={{ fontSize: 13, fontWeight: '900', color: theme.ink[900], marginBottom: 6, textAlign: 'right', writingDirection: 'rtl' }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View
        style={{
          flexDirection: rtlRow(),
          borderWidth: 1,
          borderColor: theme.ink[200],
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {/* Fixed player-name column (start/right side in RTL). */}
        <View style={{ width: NAME_W }}>
          <View
            style={{
              height: HEADER_H,
              justifyContent: 'center',
              paddingHorizontal: 8,
              backgroundColor: theme.ink[100],
              borderBottomWidth: 1,
              borderBottomColor: theme.ink[200],
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: theme.ink[500], textAlign: 'right' }}>שחקן</Text>
          </View>
          {rows.map((p, i) => (
            <View
              key={i}
              style={{
                height: ROW_H,
                justifyContent: 'center',
                paddingHorizontal: 8,
                backgroundColor: i % 2 ? theme.ink[50] : theme.white,
                borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                borderBottomColor: theme.ink[100],
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }}>
                {p.name}{p.isGK ? ' (ש)' : ''}
              </Text>
            </View>
          ))}
        </View>

        {/* Vertical divider — an explicit flex child so it sits between the name
            column and the stats area regardless of the runtime flex direction. */}
        <View style={{ width: 1, backgroundColor: theme.ink[200] }} />

        {/* Horizontally scrolling stat columns. Header + data rows share the
            same column widths + fixed heights so they stay aligned. */}
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View
              style={{
                flexDirection: rtlRow(),
                height: HEADER_H,
                backgroundColor: theme.ink[100],
                borderBottomWidth: 1,
                borderBottomColor: theme.ink[200],
              }}
            >
              {cols.map((c) => (
                <View key={c} style={{ width: COL_W, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 }}>
                  <Text numberOfLines={2} style={{ fontSize: 9.5, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>
                    {labelHe(c)}
                  </Text>
                </View>
              ))}
            </View>
            {rows.map((p, i) => (
              <View
                key={i}
                style={{
                  flexDirection: rtlRow(),
                  height: ROW_H,
                  backgroundColor: i % 2 ? theme.ink[50] : theme.white,
                  borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                  borderBottomColor: theme.ink[100],
                }}
              >
                {cols.map((c) => (
                  <View key={c} style={{ width: COL_W, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.ink[900] }}>
                      {formatStatValue(c, p.stats?.[c])}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export function FotmobPlayerStatsTable({
  players,
  homeTeamName,
  awayTeamName,
}: {
  players: FotmobPlayerRating[];
  homeTeamName: string;
  awayTeamName: string;
}) {
  const hasGK = players?.some((p) => p.isGK) ?? false;
  const cats = PLAYER_STAT_CATEGORIES.filter((c) => !c.gkOnly || hasGK);
  const [sel, setSel] = useState<string>(cats[0]?.id ?? 'top');

  if (!players || players.length === 0) return null;

  const activeCat = cats.find((c) => c.id === sel) ?? cats[0];
  if (!activeCat) return null;

  // GK-only categories only make sense for goalkeepers; every other category
  // shows the full roster.
  const shown = activeCat.gkOnly ? players.filter((p) => p.isGK) : players;
  const cols = activeCat.labels.filter((label) => hasData(label, shown));

  const home = shown.filter((p) => p.isHome).sort(byRatingDesc);
  const away = shown.filter((p) => !p.isHome).sort(byRatingDesc);

  return (
    <View>
      <TabBar
        items={cats.map((c) => ({ id: c.id, label: c.titleHe }))}
        value={activeCat.id}
        onChange={setSel}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 14 }}>
        {cols.length === 0 ? (
          <Text style={{ fontSize: 12, color: theme.ink[500], textAlign: 'center', paddingVertical: 12 }}>
            אין נתונים בקטגוריה זו.
          </Text>
        ) : (
          <>
            <TeamStatsTable title={homeTeamName} rows={home} cols={cols} />
            <TeamStatsTable title={awayTeamName} rows={away} cols={cols} />
          </>
        )}
      </View>
    </View>
  );
}

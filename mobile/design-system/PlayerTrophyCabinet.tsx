/**
 * PlayerTrophyCabinet — mobile mirror of the web component. Renders one
 * card per (league, country) with wins/runner-ups summary and per-season
 * detail rows showing the team the player was with that season.
 *
 * Israeli Ligat HaAl champions get the gold-medal icon (🥇 — Israeli plate
 * convention); other wins get the trophy icon (🏆).
 */

import { View, Text } from 'react-native';
import type { PlayerTrophyGroup } from '@shared/types/mobile-api';
import { theme } from './theme';

function pickWinIcon(leagueHe: string, countryEn: string | null): string {
  if (countryEn === 'Israel' && leagueHe === 'ליגת העל') return '🥇';
  return '🏆';
}

export function PlayerTrophyCabinet({ trophies }: { trophies: PlayerTrophyGroup[] }) {
  if (!trophies || trophies.length === 0) {
    return (
      <Text style={{ paddingHorizontal: 16, color: theme.ink[500], fontSize: 13 }}>
        אין הישגים רשומים.
      </Text>
    );
  }
  return (
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      {trophies.map((t) => {
        const winIcon = pickWinIcon(t.leagueNameHe, t.countryEn);
        return (
          <View
            key={`${t.leagueNameHe}|${t.countryEn || ''}`}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#fcd34d',
              backgroundColor: '#fffbeb',
              padding: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: theme.ink[900] }}>
                  {t.leagueNameHe}
                </Text>
                {t.countryHe ? (
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.ink[500], marginTop: 1 }}>
                    {t.countryHe}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  {t.wins > 0 ? (
                    <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '800' }}>
                      {winIcon} {t.wins}
                    </Text>
                  ) : null}
                  {t.runnerUps > 0 ? (
                    <Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '800' }}>
                      🥈 {t.runnerUps}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={{ marginTop: 10, gap: 4 }}>
              {t.details.slice(0, 12).map((d, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink[700] }}>
                    {d.seasonLabel}
                  </Text>
                  <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: theme.ink[700], marginHorizontal: 6 }}>
                    {d.teamName || ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: d.kind === 'win' ? '#b45309' : theme.ink[300] }}>
                    {d.kind === 'win' ? winIcon : '🥈'}
                  </Text>
                </View>
              ))}
              {t.details.length > 12 ? (
                <Text style={{ fontSize: 10, color: theme.ink[300] }}>
                  +{t.details.length - 12} עוד
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

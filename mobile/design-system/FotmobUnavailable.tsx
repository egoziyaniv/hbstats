/**
 * FotmobUnavailable — "פציעות והרחקות" block for the game screen. Two columns
 * (home first → visually on the RIGHT under RTL), each listing the team's
 * injured/suspended players with a type badge (פציעה / הרחקה) and a muted
 * expected-return subline. Renders nothing when there is no data.
 */

import { View, Text } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { unavailabilityTypeHe, formatReturnHe } from '@shared/fotmob-player-stats';
import type { FotmobUnavailablePlayer } from '@shared/types/mobile-api';
import { Card } from './Card';
import { theme } from './theme';

function TypeBadge({ type }: { type: FotmobUnavailablePlayer['type'] }) {
  const isSusp = type === 'suspension';
  return (
    <View
      style={{
        backgroundColor: isSusp ? theme.result.lossSoft : '#fef3c7',
        borderRadius: 5,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 9.5, fontWeight: '800', color: isSusp ? theme.result.loss : '#92400e' }}>
        {unavailabilityTypeHe(type)}
      </Text>
    </View>
  );
}

function TeamColumn({ title, items }: { title: string; items: FotmobUnavailablePlayer[] }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.ink[50], borderRadius: 14, padding: 12 }}>
      <Text
        style={{ fontSize: 13, fontWeight: '900', color: theme.ink[900], textAlign: 'center', marginBottom: 8 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {items.length === 0 ? (
        <Text style={{ fontSize: 11, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
          אין נעדרים ידועים
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((p, i) => {
            const ret = formatReturnHe(p.expectedReturnDate, p.expectedReturn);
            return (
              <View key={i}>
                <View style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 6 }}>
                  <TypeBadge type={p.type} />
                  <Text
                    style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.ink[900], textAlign: 'right' }}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                </View>
                {ret ? (
                  <Text style={{ fontSize: 10.5, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl', marginTop: 2 }}>
                    {ret}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function FotmobUnavailable({
  unavailable,
  homeTeamName,
  awayTeamName,
}: {
  unavailable: { home: FotmobUnavailablePlayer[]; away: FotmobUnavailablePlayer[] } | null;
  homeTeamName: string;
  awayTeamName: string;
}) {
  if (!unavailable) return null;
  const home = unavailable.home ?? [];
  const away = unavailable.away ?? [];
  if (home.length === 0 && away.length === 0) return null;

  return (
    <Card>
      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink[900], letterSpacing: -0.3, marginBottom: 12, textAlign: 'right', writingDirection: 'rtl' }}>
        פציעות והרחקות
      </Text>
      <View style={{ flexDirection: rtlRow(), gap: 12 }}>
        <TeamColumn title={homeTeamName} items={home} />
        <TeamColumn title={awayTeamName} items={away} />
      </View>
    </Card>
  );
}

/**
 * StatAnswerCard — mobile mirror of the web component (src/components/StatAnswerCard.tsx).
 * Renders the answer to a single "ask a question" stat query: a headline
 * (or an empty state when the resolver couldn't compute one), an optional
 * secondary line, a leaderboard or proportional bar chart depending on
 * cardType, a narrative blurb, a coverage note, and an optional "לפרטים ←"
 * link into the app for in-app hrefs only.
 */

import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useTheme } from '@/contexts/ThemeContext';
import { Card } from './Card';
import { theme } from './theme';
import type { StatAnswerApi } from '@shared/types/mobile-api';

// Only navigate in-app for hrefs pointing at routes this app actually has —
// anything else (e.g. a web-only route) is omitted rather than risk a dead link.
const IN_APP_HREF_PREFIXES = ['/players/', '/games/', '/teams/', '/history/'];

function isInAppHref(href: string): boolean {
  // The h2h resolver emits a keyed path (/history/h2h/<a>__<b>), but mobile's
  // h2h screen is a query-param route (/history/h2h?a=&b=) with no matching
  // dynamic segment — exclude it so we don't offer a dead link.
  return IN_APP_HREF_PREFIXES.some((prefix) => href.startsWith(prefix)) && !href.startsWith('/history/h2h/');
}

export function StatAnswerCard({ card }: { card: StatAnswerApi }) {
  const router = useRouter();
  const { brand } = useTheme();

  if (!card.headline) {
    return (
      <Card>
        <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>
          אין מספיק נתונים
        </Text>
      </Card>
    );
  }

  const max = Math.max(1, ...(card.series ?? []).map((s) => s.value));

  return (
    <Card>
      <Text style={{ fontSize: 11, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
        {card.titleHe}
      </Text>

      <View style={{ flexDirection: rtlRow(), alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '900', color: theme.ink[900] }}>{card.headline.label}</Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: brand.accent }}>{card.headline.value}</Text>
        {card.headline.unit ? (
          <Text style={{ fontSize: 11, color: theme.ink[500] }}>{card.headline.unit}</Text>
        ) : null}
      </View>

      {card.secondary ? (
        <Text style={{ marginTop: 4, fontSize: 11.5, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }}>
          {card.secondary}
        </Text>
      ) : null}

      {card.cardType === 'leaderboard' && card.top ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {card.top.map((t, i) => (
            <View key={i} style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flexShrink: 1, fontSize: 13, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
                {i + 1}. {t.name}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.ink[900] }}>{t.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {card.cardType === 'bar' && card.series ? (
        <View style={{ marginTop: 10, flexDirection: rtlRow(), alignItems: 'flex-end', gap: 4, height: 48 }}>
          {card.series.map((s, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: `${Math.max(4, Math.round((s.value / max) * 100))}%`,
                backgroundColor: brand.accent,
                borderRadius: 4,
              }}
            />
          ))}
        </View>
      ) : null}

      {card.narrative ? (
        <Text style={{ marginTop: 8, fontSize: 11.5, fontStyle: 'italic', color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl' }}>
          &quot;{card.narrative}&quot;
        </Text>
      ) : null}

      {card.coverageNote ? (
        <Text style={{ marginTop: 4, fontSize: 10, color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
          {card.coverageNote}
        </Text>
      ) : null}

      {card.href && isInAppHref(card.href) ? (
        <Pressable onPress={() => router.push(card.href as any)} style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: brand.accent }}>לפרטים ←</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/**
 * MatchAnalysisBlock — the owner-approved data column for a game (mirrors the web
 * MatchAnalysisBlock). Standalone card on the overview tab (post-match), or `embedded`
 * inside the "לקראת המשחק" card, where it replaces the short AI paragraph.
 */

import { View, Text } from 'react-native';
import type { MatchAnalysisApi } from '@shared/types/mobile-api';
import { Card } from './Card';
import { Section } from './Section';
import { theme } from './theme';

const rtlText = { textAlign: 'right' as const, writingDirection: 'rtl' as const };

function Body({ analysis }: { analysis: MatchAnalysisApi }) {
  return (
    <View style={{ gap: 8 }}>
      {analysis.titleHe ? (
        <Text style={{ ...rtlText, fontSize: 15, fontWeight: '900', color: theme.ink[900] }}>{analysis.titleHe}</Text>
      ) : null}
      {analysis.paragraphs.map((p, i) => (
        <Text key={i} style={{ ...rtlText, fontSize: 13, lineHeight: 21, color: theme.ink[700] }}>{p}</Text>
      ))}
      <Text style={{ ...rtlText, fontSize: 10, color: theme.ink[500] }}>נכתב בעזרת AI מנתוני האתר ונבדק בידי העורך</Text>
    </View>
  );
}

export function MatchAnalysisBlock({ analysis, embedded = false }: { analysis: MatchAnalysisApi; embedded?: boolean }) {
  if (!analysis.paragraphs.length) return null;
  if (embedded) {
    return (
      <View style={{ backgroundColor: '#fffbeb', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
        <Body analysis={analysis} />
      </View>
    );
  }
  return (
    <Card>
      <Section title="ניתוח">
        <Body analysis={analysis} />
      </Section>
    </Card>
  );
}

import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSeasonDossier } from '@/hooks/useSeasonDossier';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { rtlRow } from '@/lib/rtl';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import type { SeasonDossierMetric, SeasonDossierMetricKey, SeasonDossierPayload } from '@shared/types/mobile-api';

const metricLabels: Record<SeasonDossierMetricKey, string> = { matches: 'משחקים', wins: 'ניצחונות', goalsFor: 'שערים', leaguePosition: 'מיקום בליגה' };
const coverageLabels = { COMPLETE: 'כיסוי מלא', PARTIAL: 'כיסוי חלקי', UNKNOWN: 'כיסוי לא ידוע' } as const;
const rtlText = { textAlign: 'right' as const, writingDirection: 'rtl' as const };

function openHttpUrl(url: string) {
  if (/^https?:\/\//i.test(url)) void Linking.openURL(url).catch(() => {});
}

function EvidenceModal({ metric, dossier, onClose, onGamePress }: {
  metric: SeasonDossierMetric | null; dossier: SeasonDossierPayload; onClose: () => void; onGamePress: (id: string) => void;
}) {
  if (!metric) return null;
  const ids = new Set(metric.evidenceGameIds);
  const games = dossier.games.flatMap((group) => group.games).filter((game) => ids.has(game.id));
  const competitionIds = new Set(metric.competitionBreakdown.map((row) => row.competitionId));
  if (metric.key === 'leaguePosition' && dossier.standing) competitionIds.add(dossier.standing.competitionId);
  const sources = dossier.sources.filter((source) => (source.scope === 'METRICS' || source.scope === 'BOTH') && (!source.competitionId || competitionIds.has(source.competitionId)));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ maxHeight: '84%', backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 }}>
          <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10 }}>
            <View><Text style={{ ...rtlText, color: theme.accent, fontSize: 11, fontWeight: '900' }}>מאיפה המספר?</Text><Text style={{ ...rtlText, fontSize: 20, fontWeight: '900', color: theme.ink[900] }}>{metricLabels[metric.key]}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="סגירת פירוט המדד" onPress={onClose} style={{ borderWidth: 1, borderColor: theme.ink[300], borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ fontWeight: '800' }}>סגירה</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36 }}>
            <Text style={{ ...rtlText, color: theme.ink[700], lineHeight: 23 }}>{metric.definitionHe}</Text>
            <Text style={{ ...rtlText, marginTop: 8, fontWeight: '800', color: theme.ink[500] }}>{coverageLabels[metric.coverage]}</Text>
            {metric.competitionBreakdown.map((row) => <View key={row.competitionId} style={{ marginTop: 8, padding: 10, backgroundColor: theme.ink[50], borderRadius: 10, flexDirection: rtlRow(), justifyContent: 'space-between' }}><Text style={{ fontWeight: '700' }}>{row.competitionNameHe}</Text><Text style={{ fontWeight: '900' }}>{row.value ?? 'לא ידוע'}</Text></View>)}
            <Text style={{ ...rtlText, marginTop: 18, fontSize: 15, fontWeight: '900' }}>מקורות</Text>
            {sources.length ? sources.map((source) => <Pressable accessibilityRole="link" key={source.id} onPress={() => openHttpUrl(source.url)} style={{ paddingVertical: 8 }}><Text style={{ ...rtlText, color: theme.accent, fontWeight: '800', textDecorationLine: 'underline' }}>{source.labelHe}</Text><Text style={{ ...rtlText, color: theme.ink[500], fontSize: 11 }}>{source.provider}</Text></Pressable>) : <Text style={{ ...rtlText, marginTop: 7, color: theme.ink[500] }}>לא צורף מקור חיצוני.</Text>}
            <Text style={{ ...rtlText, marginTop: 18, fontSize: 15, fontWeight: '900' }}>המשחקים שמרכיבים את הנתון</Text>
            {games.length ? games.map((game) => <Pressable key={game.id} onPress={() => { onClose(); onGamePress(game.id); }} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}><Text style={{ ...rtlText, fontWeight: '800' }}>{new Date(game.dateTime).toLocaleDateString('he-IL')} · {game.opponent.nameHe} · {game.goalsFor}:{game.goalsAgainst}</Text></Pressable>) : <Text style={{ ...rtlText, marginTop: 7, color: theme.ink[500] }}>אין משחקי ראיה זמינים.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SeasonDossierBody({ dossier, onGamePress, onPlayerPress }: {
  dossier: SeasonDossierPayload; onGamePress: (id: string) => void; onPlayerPress?: (id: string) => void;
}) {
  const { brand } = useTheme();
  const [metric, setMetric] = useState<SeasonDossierMetric | null>(null);
  const hero = absoluteImage(dossier.editorial?.heroImageUrl ?? null);
  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ minHeight: 280, backgroundColor: brand.accentDeep, justifyContent: 'flex-end', padding: 20, overflow: 'hidden' }}>
          {hero ? <Image source={{ uri: hero }} style={{ position: 'absolute', inset: 0, opacity: 0.36 }} resizeMode="cover" /> : null}
          <View style={{ alignSelf: 'flex-end', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: 'white', fontSize: 11, fontWeight: '900' }}>{dossier.status === 'CURRENT' ? 'עונה נוכחית' : 'עונה שהסתיימה'}</Text></View>
          <Text style={{ ...rtlText, marginTop: 12, color: 'white', fontSize: 42, fontWeight: '900' }}>{dossier.season.name}</Text>
          <Text style={{ ...rtlText, marginTop: 8, color: 'white', fontSize: 16, lineHeight: 24, fontWeight: '700' }}>{dossier.editorial?.introHe || 'הסיפור, המספרים והמשחקים של הפועל באר שבע.'}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, padding: 12 }}>
          {['הסיפור', 'רגעים', 'סגל', 'טבלה', 'משחקים'].map((label) => <View key={label} style={{ backgroundColor: 'white', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: theme.ink[200] }}><Text style={{ fontWeight: '800', color: theme.ink[700] }}>{label}</Text></View>)}
        </ScrollView>

        <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 20 }}>
          {dossier.metrics.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`מאיפה המספר: ${metricLabels[item.key]}`} key={item.key} onPress={() => setMetric(item)} style={{ width: '48%', flexGrow: 1, minHeight: 112, backgroundColor: 'white', borderWidth: 1, borderColor: theme.ink[200], borderRadius: 16, padding: 14 }}><Text style={{ ...rtlText, fontSize: 12, color: theme.ink[500], fontWeight: '800' }}>{metricLabels[item.key]}</Text><Text style={{ ...rtlText, marginTop: 6, fontSize: 30, color: theme.ink[900], fontWeight: '900' }}>{item.value ?? 'לא ידוע'}</Text><Text style={{ ...rtlText, marginTop: 5, color: brand.accent, fontSize: 10, fontWeight: '900' }}>מאיפה המספר?</Text></Pressable>)}
        </View>

        <Section title="הסיפור של העונה"><Card><Text style={{ ...rtlText, color: theme.ink[700], lineHeight: 25 }}>{dossier.editorial?.summaryHe || 'הסיפור המלא יתווסף בהמשך.'}</Text>{dossier.coach ? <Text style={{ ...rtlText, marginTop: 14, fontWeight: '800' }}>מאמן: {dossier.coach.nameHe}</Text> : null}</Card></Section>
        <Section title="הרגעים שעיצבו את העונה"><View style={{ gap: 10 }}>{dossier.moments.length ? dossier.moments.map((moment) => <Card key={moment.id}><Text style={{ ...rtlText, color: brand.accent, fontSize: 11, fontWeight: '900' }}>{new Date(moment.eventDate).toLocaleDateString('he-IL')}</Text><Text style={{ ...rtlText, marginTop: 4, fontSize: 16, fontWeight: '900' }}>{moment.titleHe}</Text><Text style={{ ...rtlText, marginTop: 5, color: theme.ink[700], lineHeight: 22 }}>{moment.bodyHe}</Text>{moment.game ? <Pressable onPress={() => onGamePress(moment.game!.id)}><Text style={{ ...rtlText, marginTop: 8, color: brand.accent, fontWeight: '800' }}>למשחק המקושר ←</Text></Pressable> : null}</Card>) : <Card><Text style={{ ...rtlText, color: theme.ink[500] }}>רגעי העונה יתווספו בהמשך.</Text></Card>}</View></Section>
        <Section title="הסגל"><View style={{ gap: 8 }}>{dossier.squad.map((player) => <Pressable key={player.playerId} onPress={() => onPlayerPress?.(player.playerId)}><Card><View style={{ flexDirection: rtlRow(), justifyContent: 'space-between', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ ...rtlText, fontWeight: '900' }}>{player.nameHe}</Text><Text style={{ ...rtlText, marginTop: 3, color: theme.ink[500], fontSize: 11 }}>{player.position || 'ללא עמדה'} · {player.appearances ?? '—'} הופעות · {player.goals ?? '—'} שערים</Text></View>{player.jerseyNumber !== null ? <Text style={{ color: brand.accent, fontSize: 22, fontWeight: '900' }}>{player.jerseyNumber}</Text> : null}</View></Card></Pressable>)}</View></Section>
        <Section title="הקשר ליגתי">{dossier.standing ? <Card><View style={{ flexDirection: rtlRow(), justifyContent: 'space-around' }}>{[['מיקום', dossier.standing.position ?? 'לא ידוע'], ['נקודות', dossier.standing.points], ['מאזן', `${dossier.standing.wins}-${dossier.standing.draws}-${dossier.standing.losses}`]].map(([label, value]) => <View key={label} style={{ alignItems: 'center' }}><Text style={{ color: theme.ink[500], fontSize: 11 }}>{label}</Text><Text style={{ marginTop: 4, fontSize: 20, fontWeight: '900' }}>{value}</Text></View>)}</View></Card> : <Card><Text style={{ ...rtlText, color: theme.ink[500] }}>אין טבלת ליגה זמינה.</Text></Card>}</Section>
        <Section title="משחקי העונה"><View style={{ gap: 10 }}>{dossier.games.map((group) => <Card key={`${group.competitionId}-${group.labelHe}`}><Text style={{ ...rtlText, fontWeight: '900' }}>{group.labelHe}</Text>{group.games.map((game) => <Pressable key={game.id} onPress={() => onGamePress(game.id)} style={{ flexDirection: rtlRow(), justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.ink[100] }}><Text style={{ flex: 1, ...rtlText, fontWeight: '700' }}>{game.opponent.nameHe}</Text><Text style={{ fontWeight: '900' }}>{game.goalsFor === null ? 'טרם שוחק' : `${game.goalsFor}:${game.goalsAgainst}`}</Text></Pressable>)}</Card>)}</View></Section>
      </ScrollView>
      <EvidenceModal metric={metric} dossier={dossier} onClose={() => setMetric(null)} onGamePress={onGamePress} />
    </>
  );
}

export default function SeasonDossierScreen() {
  const params = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = Array.isArray(params.seasonId) ? params.seasonId[0] : params.seasonId;
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, error } = useSeasonDossier(seasonId);
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/club/seasons' as any); };
  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="תיק עונה" onBack={goBack} showBack />
      {isLoading && !data ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.accent} /></View> : error || !data ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text style={{ ...rtlText, color: theme.ink[700] }}>תיק העונה לא נמצא.</Text></View> : <SeasonDossierBody dossier={data} onGamePress={(id) => router.push(`/games/${id}` as any)} onPlayerPress={(id) => router.push(`/players/${id}` as any)} />}
      <BottomNav />
    </View>
  );
}

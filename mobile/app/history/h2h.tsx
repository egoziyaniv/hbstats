import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useRouter, type Router } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useH2HClubs, useH2H } from '@/hooks/useH2H';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { BottomNav } from '@/design-system/BottomNav';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { H2HClubOption, FullH2HApiPayload } from '@shared/types/mobile-api';

// Meeting dates are date-only ISO strings ("YYYY-MM-DD") — format the parts
// directly, no Date() round-trip (UTC-midnight parsing can shift a day).
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};

export default function H2HScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data: clubsData, isLoading: clubsLoading } = useH2HClubs();
  const clubs = clubsData?.clubs ?? [];

  const [a, setA] = useState<string | undefined>(undefined);
  const [b, setB] = useState<string | undefined>(undefined);
  const [autoPicked, setAutoPicked] = useState(false);
  const { data: h2h, isLoading: h2hLoading, isError } = useH2H(a, b);

  // StatsAI is Hapoel Be'er Sheva-fans-first — preselect HBS as side A once the
  // club list arrives (only on first load; the user can still deselect/change).
  useEffect(() => {
    if (autoPicked || a || b || clubs.length === 0) return;
    const hbs = clubs.find((c) => c.nameHe.includes('באר שבע') && c.nameHe.includes('הפועל'));
    if (hbs) setA(hbs.clubKey);
    setAutoPicked(true);
  }, [autoPicked, a, b, clubs]);

  // Each side's list excludes whatever the other side already picked.
  const clubsForA = useMemo(() => clubs.filter((c) => c.clubKey !== b), [clubs, b]);
  const clubsForB = useMemo(() => clubs.filter((c) => c.clubKey !== a), [clubs, a]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="יריבויות" subtitle="עימותי כל הזמנים" onBack={() => router.back()} showBack />

      {clubsLoading && clubs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
          <ClubPickerRow
            label="קבוצה ראשונה"
            clubs={clubsForA}
            selectedKey={a}
            onSelect={(key) => setA(key === a ? undefined : key)}
            brandAccent={brand.accent}
            brandGlow={brand.accentGlow}
          />
          <ClubPickerRow
            label="קבוצה שנייה"
            clubs={clubsForB}
            selectedKey={b}
            onSelect={(key) => setB(key === b ? undefined : key)}
            brandAccent={brand.accent}
            brandGlow={brand.accentGlow}
          />

          {!a || !b ? (
            <Card>
              <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>
                בחרו שתי קבוצות כדי לראות את ההיסטוריה ביניהן.
              </Text>
            </Card>
          ) : h2hLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={brand.accent} />
            </View>
          ) : isError || !h2h ? (
            <Card>
              <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>שגיאה בטעינת הנתונים.</Text>
            </Card>
          ) : h2h.totals.games === 0 ? (
            <Card>
              <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>הקבוצות טרם נפגשו.</Text>
            </Card>
          ) : (
            <H2HResult h2h={h2h} router={router} />
          )}
        </ScrollView>
      )}

      <BottomNav />
    </View>
  );
}

function ClubPickerRow({
  label,
  clubs,
  selectedKey,
  onSelect,
  brandAccent,
  brandGlow,
}: {
  label: string;
  clubs: H2HClubOption[];
  selectedKey: string | undefined;
  onSelect: (clubKey: string) => void;
  brandAccent: string;
  brandGlow: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
        {label}
      </Text>
      {/* nestedScrollEnabled — horizontal row inside the screen's vertical
          ScrollView; without it Android can swallow the inner scroll. */}
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, paddingHorizontal: 2 }}>
        {clubs.map((c) => (
          <ClubChip
            key={c.clubKey}
            club={c}
            selected={c.clubKey === selectedKey}
            onPress={() => onSelect(c.clubKey)}
            brandAccent={brandAccent}
            brandGlow={brandGlow}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ClubChip({
  club,
  selected,
  onPress,
  brandAccent,
  brandGlow,
}: {
  club: H2HClubOption;
  selected: boolean;
  onPress: () => void;
  brandAccent: string;
  brandGlow: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? brandAccent : theme.ink[200],
        backgroundColor: selected ? brandGlow : 'white',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: selected ? '800' : '600', color: selected ? theme.ink[900] : theme.ink[700] }}>
        {club.nameHe}
      </Text>
    </Pressable>
  );
}

function H2HResult({ h2h, router }: { h2h: FullH2HApiPayload; router: Router }) {
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <View style={{ flexDirection: rtlRow(), justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: theme.result.win }} numberOfLines={1}>{h2h.teamAName}</Text>
          <Text style={{ fontSize: 12, color: theme.ink[500] }}>{h2h.totals.games} מפגשים</Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: theme.result.loss }} numberOfLines={1}>{h2h.teamBName}</Text>
        </View>
        <View style={{ flexDirection: rtlRow(), justifyContent: 'space-around', marginTop: 10 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: theme.result.win }}>{h2h.totals.winsA}</Text>
            <Text style={{ fontSize: 11, color: theme.ink[500] }}>נצחונות</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: theme.ink[500] }}>{h2h.totals.draws}</Text>
            <Text style={{ fontSize: 11, color: theme.ink[500] }}>תיקו</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: theme.result.loss }}>{h2h.totals.winsB}</Text>
            <Text style={{ fontSize: 11, color: theme.ink[500] }}>נצחונות</Text>
          </View>
        </View>
        <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: theme.ink[500] }}>
          סה״כ שערים: {h2h.totals.goalsA} — {h2h.totals.goalsB}
        </Text>
      </Card>

      {h2h.byCompetition.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>לפי תחרות</Text>
          <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 8 }}>
            {h2h.byCompetition.map((c) => (
              <View
                key={c.competitionNameHe}
                style={{ borderWidth: 1, borderColor: theme.ink[200], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'white' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink[900] }}>
                  {c.competitionNameHe} · {c.games} מש&#39; · {c.winsA}-{c.draws}-{c.winsB}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: rtlRow(), gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Card>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
              {h2h.teamAName} כמארחת
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: '800', color: theme.ink[900], textAlign: 'right' }}>
              {h2h.atAHome.games} מש&#39; · {h2h.atAHome.winsA}-{h2h.atAHome.draws}-{h2h.atAHome.winsB}
            </Text>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }} numberOfLines={1}>
              {h2h.teamBName} כמארחת
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: '800', color: theme.ink[900], textAlign: 'right' }}>
              {h2h.atBHome.games} מש&#39; · {h2h.atBHome.winsA}-{h2h.atBHome.draws}-{h2h.atBHome.winsB}
            </Text>
          </Card>
        </View>
      </View>

      {h2h.biggestAWin || h2h.biggestBWin ? (
        <View style={{ flexDirection: rtlRow(), gap: 10 }}>
          {h2h.biggestAWin ? (
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/games/${h2h.biggestAWin!.gameId}` as any)}>
              <Card>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.result.win }} numberOfLines={1}>
                  הניצחון הגדול · {h2h.teamAName}
                </Text>
                <Text style={{ marginTop: 4, fontSize: 18, fontWeight: '900', color: theme.ink[900] }}>{h2h.biggestAWin.label}</Text>
              </Card>
            </Pressable>
          ) : null}
          {h2h.biggestBWin ? (
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/games/${h2h.biggestBWin!.gameId}` as any)}>
              <Card>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.result.loss }} numberOfLines={1}>
                  הניצחון הגדול · {h2h.teamBName}
                </Text>
                <Text style={{ marginTop: 4, fontSize: 18, fontWeight: '900', color: theme.ink[900] }}>{h2h.biggestBWin.label}</Text>
              </Card>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
          כל המפגשים ({h2h.meetings.length})
        </Text>
        <Card pad={false}>
          {h2h.meetings.map((m, i) => (
            <Pressable key={m.gameId} onPress={() => router.push(`/games/${m.gameId}` as any)}>
              <View
                style={{
                  flexDirection: rtlRow(),
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderBottomWidth: i === h2h.meetings.length - 1 ? 0 : 1,
                  borderBottomColor: theme.ink[100],
                }}
              >
                <Text style={{ fontSize: 10, color: theme.ink[500] }}>{fmtDate(m.date)}</Text>
                <Text
                  style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', color: theme.ink[900], textAlign: 'center' }}
                  numberOfLines={1}
                >
                  {m.homeTeamName} {m.homeScore}:{m.awayScore} {m.awayTeamName}
                </Text>
                <Text style={{ fontSize: 10, color: theme.ink[500] }} numberOfLines={1}>{m.competitionNameHe ?? '—'}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      </View>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useStatQuestions } from '@/hooks/useStatQuestions';
import { useStatAnswer } from '@/hooks/useStatAnswer';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { BottomNav } from '@/design-system/BottomNav';
import { StatAnswerCard } from '@/design-system/StatAnswerCard';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { StatQuestionApi } from '@shared/types/mobile-api';

export default function StatAskScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useStatQuestions();
  const questions = data?.questions ?? [];
  const clubs = data?.clubs ?? [];

  const [clubKey, setClubKey] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the first club once the list loads (mirrors the web client's
  // useState(clubs[0]?.clubKey) — but clubs arrive async here, so an effect).
  useEffect(() => {
    if (!clubKey && clubs.length > 0) setClubKey(clubs[0].clubKey);
  }, [clubKey, clubs]);

  const selectedQuestion = questions.find((q) => q.id === selectedId) ?? null;
  // Rival = first club that isn't the selected one — mirrors StatAskClient.tsx's
  // `clubs.find((c) => c.clubKey !== clubKey)`.
  const rivalKey = selectedQuestion?.needsRival
    ? clubs.find((c) => c.clubKey !== clubKey)?.clubKey
    : undefined;
  const effectiveClubKey = selectedQuestion?.needsClub ? clubKey : undefined;

  const { data: ansData, isLoading: isAnswerLoading } = useStatAnswer(selectedId, effectiveClubKey, rivalKey);
  const card = ansData?.card;

  const clubQuestions = questions.filter((q) => q.scope === 'club');
  const leagueQuestions = questions.filter((q) => q.scope === 'league');

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title="שיאים ותשובות" subtitle="ליגת העל" onBack={() => router.back()} showBack />
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        >
          {clubs.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>
                קבוצה
              </Text>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, paddingHorizontal: 2 }}
              >
                {clubs.map((c) => (
                  <Chip
                    key={c.clubKey}
                    label={c.nameHe}
                    selected={clubKey === c.clubKey}
                    onPress={() => setClubKey(c.clubKey)}
                    brandAccent={brand.accent}
                    brandGlow={brand.accentGlow}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {clubQuestions.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }}>
                על הקבוצה
              </Text>
              <QuestionChips
                questions={clubQuestions}
                selectedId={selectedId}
                onSelect={setSelectedId}
                brandAccent={brand.accent}
                brandGlow={brand.accentGlow}
              />
            </View>
          ) : null}

          {leagueQuestions.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }}>
                בכל הליגה
              </Text>
              <QuestionChips
                questions={leagueQuestions}
                selectedId={selectedId}
                onSelect={setSelectedId}
                brandAccent={brand.accent}
                brandGlow={brand.accentGlow}
              />
            </View>
          ) : null}

          {selectedId ? (
            isAnswerLoading && !card ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={brand.accent} />
              </View>
            ) : card ? (
              <StatAnswerCard card={card} />
            ) : null
          ) : (
            <Card>
              <Text style={{ fontSize: 13, color: theme.ink[500], textAlign: 'center' }}>
                בחרו שאלה כדי לראות תשובה
              </Text>
            </Card>
          )}
        </ScrollView>
      )}
      <BottomNav />
    </View>
  );
}

function QuestionChips({
  questions,
  selectedId,
  onSelect,
  brandAccent,
  brandGlow,
}: {
  questions: StatQuestionApi[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  brandAccent: string;
  brandGlow: string;
}) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: rtlRow(), gap: 8, paddingHorizontal: 2 }}
    >
      {questions.map((q) => (
        <Chip
          key={q.id}
          label={q.titleHe}
          selected={q.id === selectedId}
          onPress={() => onSelect(q.id)}
          brandAccent={brandAccent}
          brandGlow={brandGlow}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  brandAccent,
  brandGlow,
}: {
  label: string;
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
      <Text style={{ fontSize: 12, fontWeight: '800', color: selected ? theme.ink[900] : theme.ink[700] }}>
        {label}
      </Text>
    </Pressable>
  );
}

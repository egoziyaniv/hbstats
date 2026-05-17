import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePreferences, useUpdatePreferences } from '@/hooks/usePreferences';
import { absoluteImage } from '@/lib/config';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { theme } from '@/design-system/theme';
import type { PreferencesPayload, PreferenceTeamOption, PreferenceCompetitionOption } from '@shared/types/mobile-api';

export default function PreferencesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data, isLoading } = usePreferences();
  const { color, brand, schemes, setColor } = useTheme();
  const update = useUpdatePreferences();

  const onLogout = () => {
    Alert.alert('יציאה', 'האם להתנתק?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const toggleTeam = (apiId: number) => {
    const set = new Set(data.favoriteTeamApiIds);
    if (set.has(apiId)) set.delete(apiId); else set.add(apiId);
    const next: PreferencesPayload = { ...data, favoriteTeamApiIds: [...set] };
    update.mutate(next);
  };
  const toggleCompetition = (apiId: number) => {
    const set = new Set(data.favoriteCompetitionApiIds);
    if (set.has(apiId)) set.delete(apiId); else set.add(apiId);
    const next: PreferencesPayload = { ...data, favoriteCompetitionApiIds: [...set] };
    update.mutate(next);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.canvas.start }}
      contentContainerStyle={{ paddingVertical: 16, gap: 16, paddingBottom: 32 }}
    >
      <Section title="משתמש">
        <Card>
          <Text style={{ color: theme.ink[500], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right', writingDirection: 'rtl' }}>
            מחובר כ
          </Text>
          <Text style={{ color: theme.ink[900], fontSize: 18, fontWeight: '800', marginTop: 2, textAlign: 'right', writingDirection: 'rtl' }}>
            {user?.name ?? '—'}
          </Text>
          <Text style={{ color: theme.ink[500], fontSize: 13, marginTop: 2, textAlign: 'right', writingDirection: 'rtl' }}>{user?.email ?? '—'}</Text>
        </Card>
      </Section>

      <Section title="צבע מותג">
        <Card>
          <Text style={{ color: theme.ink[700], fontSize: 13, marginBottom: 12, textAlign: 'right', writingDirection: 'rtl' }}>
            הצבע נשמר במכשיר ומסונכרן עם בחירת הצבע באתר.
          </Text>
          <View style={{ flexDirection: rtlRow(), gap: 10 }}>
            {schemes.map((s) => {
              const selected = s.name === color;
              return (
                <Pressable
                  key={s.name}
                  onPress={() => setColor(s.name)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? s.preview : theme.ink[200],
                    backgroundColor: selected ? s.preview + '14' : 'transparent',
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: s.preview, marginBottom: 6 }} />
                  <Text style={{ color: selected ? theme.ink[900] : theme.ink[700], fontSize: 12, fontWeight: selected ? '800' : '600' }}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Section>

      <Section title={`קבוצות מועדפות${data.favoriteTeamApiIds.length ? ` · ${data.favoriteTeamApiIds.length}` : ''}`}>
        <Card>
          {data.availableTeams.length === 0 ? (
            <Text style={{ color: theme.ink[500], fontSize: 13, textAlign: 'right', writingDirection: 'rtl' }}>
              אין קבוצות זמינות.
            </Text>
          ) : (
            <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 8 }}>
              {data.availableTeams.map((t) => (
                <TeamChip
                  key={t.id}
                  team={t}
                  selected={t.apiFootballId !== null && data.favoriteTeamApiIds.includes(t.apiFootballId)}
                  onPress={() => t.apiFootballId !== null && toggleTeam(t.apiFootballId)}
                  brandAccent={brand.accent}
                  brandGlow={brand.accentGlow}
                />
              ))}
            </View>
          )}
        </Card>
      </Section>

      <Section title={`ליגות מועדפות${data.favoriteCompetitionApiIds.length ? ` · ${data.favoriteCompetitionApiIds.length}` : ''}`}>
        <Card>
          {data.availableCompetitions.length === 0 ? (
            <Text style={{ color: theme.ink[500], fontSize: 13, textAlign: 'right', writingDirection: 'rtl' }}>
              אין ליגות זמינות.
            </Text>
          ) : (
            <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 8 }}>
              {data.availableCompetitions.map((c) => (
                <CompetitionChip
                  key={c.id}
                  competition={c}
                  selected={c.apiFootballId !== null && data.favoriteCompetitionApiIds.includes(c.apiFootballId)}
                  onPress={() => c.apiFootballId !== null && toggleCompetition(c.apiFootballId)}
                  brandAccent={brand.accent}
                  brandGlow={brand.accentGlow}
                />
              ))}
            </View>
          )}
        </Card>
      </Section>

      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <Pressable onPress={onLogout}>
          <View style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: '#B91C1C', fontWeight: '700', fontSize: 14 }}>התנתק</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function TeamChip({ team, selected, onPress, brandAccent, brandGlow }: {
  team: PreferenceTeamOption;
  selected: boolean;
  onPress: () => void;
  brandAccent: string;
  brandGlow: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: rtlRow(),
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? brandAccent : theme.ink[200],
        backgroundColor: selected ? brandGlow : 'white',
      }}
    >
      {absoluteImage(team.logoUrl) ? (
        <Image source={{ uri: absoluteImage(team.logoUrl) }} style={{ width: 18, height: 18, borderRadius: 4 }} />
      ) : (
        <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: theme.ink[200] }} />
      )}
      <Text style={{ fontSize: 13, fontWeight: selected ? '800' : '600', color: selected ? theme.ink[900] : theme.ink[700], writingDirection: 'rtl' }}>
        {team.name}
      </Text>
    </Pressable>
  );
}

function CompetitionChip({ competition, selected, onPress, brandAccent, brandGlow }: {
  competition: PreferenceCompetitionOption;
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
      <Text style={{ fontSize: 13, fontWeight: selected ? '800' : '600', color: selected ? theme.ink[900] : theme.ink[700], writingDirection: 'rtl' }}>
        {competition.name}
        {competition.country ? ` · ${competition.country}` : ''}
      </Text>
    </Pressable>
  );
}

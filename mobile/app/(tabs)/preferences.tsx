import { ScrollView, View, Text, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { rtlRow } from '@/lib/rtl';
import { TeamCrest } from '@/design-system/TeamCrest';
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
  const { user, logout, deleteAccount } = useAuth();
  const { data, isLoading } = usePreferences();
  const { color, brand, schemes, setColor } = useTheme();
  const update = useUpdatePreferences();

  const [deleting, setDeleting] = useState(false);

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

  function confirmDelete() {
    Alert.alert(
      'מחיקת חשבון',
      'הפעולה תמחק לצמיתות את החשבון וההעדפות שלך. אי אפשר לבטל.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              router.replace('/login');
            } catch {
              Alert.alert('שגיאה', 'מחיקת החשבון נכשלה. נסה שוב.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  // Not logged in (browsing as guest) — the preferences endpoint requires auth,
  // so show a sign-in call to action instead of an endless spinner.
  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.canvas.start, padding: 28 }}>
        <Text style={{ color: theme.ink[900], fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
          את/ה גולש/ת כאורח
        </Text>
        <Text style={{ color: theme.ink[500], fontSize: 14, marginTop: 8, textAlign: 'center', writingDirection: 'rtl' }}>
          התחבר/י או הירשם/י כדי לשמור קבוצות מועדפות, העדפות וחשבון.
        </Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={{ marginTop: 22, backgroundColor: brand.accent, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10 }}
        >
          <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>התחברות / הרשמה</Text>
        </Pressable>
      </View>
    );
  }

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

  const notif = data.notifications ?? { goals: true, results: true, reminders: true, news: true, onThisDay: true };
  const toggleNotification = (key: keyof typeof notif) => {
    const next: PreferencesPayload = { ...data, notifications: { ...notif, [key]: !notif[key] } };
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

      <Section title="התראות">
        <Card>
          <Text style={{ color: theme.ink[500], fontSize: 13, marginBottom: 4, textAlign: 'right', writingDirection: 'rtl' }}>
            בחר/י אילו התראות לקבל על הקבוצות שאתה עוקב אחריהן.
          </Text>
          <NotifRow label="⚽ גולים" desc="התראה על כל גול במשחק חי" value={notif.goals} onChange={() => toggleNotification('goals')} accent={brand.accent} />
          <NotifRow label="🏁 תוצאות סיום" desc="התוצאה הסופית בתום המשחק" value={notif.results} onChange={() => toggleNotification('results')} accent={brand.accent} />
          <NotifRow label="⏰ תזכורות משחק" desc="כשעה לפני פתיחת המשחק" value={notif.reminders} onChange={() => toggleNotification('reminders')} accent={brand.accent} />
          <NotifRow label="📰 חדשות" desc="ידיעות חדשות מהערוצים" value={notif.news} onChange={() => toggleNotification('news')} accent={brand.accent} />
          <NotifRow label="📅 היום לפני X שנים" desc="התראה יומית עם משחק היסטורי מאותו תאריך." value={notif.onThisDay} onChange={() => toggleNotification('onThisDay')} accent={brand.accent} last />
        </Card>
      </Section>

      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <Pressable onPress={onLogout}>
          <View style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: '#B91C1C', fontWeight: '700', fontSize: 14 }}>התנתק</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          testID="delete-account"
          style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', opacity: deleting ? 0.6 : 1 }}
        >
          <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 15 }}>
            {deleting ? 'מוחק…' : 'מחיקת חשבון'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function NotifRow({ label, desc, value, onChange, accent, last }: {
  label: string;
  desc: string;
  value: boolean;
  onChange: () => void;
  accent: string;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: rtlRow(),
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.ink[100],
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.ink[900], fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' }}>{label}</Text>
        <Text style={{ color: theme.ink[500], fontSize: 12, marginTop: 2, textAlign: 'right', writingDirection: 'rtl' }}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.ink[200], true: accent }}
        thumbColor="white"
      />
    </View>
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
      <TeamCrest name={team.name} logoUrl={team.logoUrl} size={18} radius={4} />
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

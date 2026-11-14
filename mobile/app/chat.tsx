/**
 * Chat — the site's data assistant in the app. Same backend as the web's floating chat
 * (/api/mobile/v1/chat → /api/ai/chat): answers from all the data via read-only SQL, logs every
 * question, 👍/👎 per answer. Signed-in users only (the server requires a user for its quota).
 */
import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { rtlRow } from '@/lib/rtl';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BackButton } from '@/design-system/BackButton';
import { theme } from '@/design-system/theme';

type Message = { role: 'user' | 'assistant'; content: string; questionId?: string; feedback?: 1 | -1 };

const EXAMPLES = [
  'כמה שערים כבש אליניב ברדה בכל העונות?',
  'מה רצף הניצחונות הארוך ביותר של הפועל באר שבע בליגה?',
  'האם הייתה קבוצה שהבקיעה 5 שערים ומעלה בשלושה משחקים רצופים?',
];

// In-app routes an answer may link to ([text](/games/123)); other paths render as plain text.
const IN_APP = /^\/(games|players|teams)\/[^/\s]+$/;

/** **bold** and [text](/path) links, like the web chat; everything else stays plain text. */
function RichText({ text, color, onLink }: { text: string; color: string; onLink: (path: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)\s]+\))/g);
  return (
    <Text style={{ color, fontSize: 15, lineHeight: 22, writingDirection: 'rtl', textAlign: 'right' }}>
      {parts.map((part, i) => {
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        if (bold) return <Text key={i} style={{ fontWeight: '800' }}>{bold[1]}</Text>;
        const link = part.match(/^\[([^\]]+)\]\((\/[^)\s]+)\)$/);
        if (link) {
          return IN_APP.test(link[2])
            ? <Text key={i} style={{ fontWeight: '800', textDecorationLine: 'underline' }} onPress={() => onLink(link[2])}>{link[1]}</Text>
            : <Text key={i}>{link[1]}</Text>;
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const msg = (e.body as { error?: unknown } | null)?.error;
    if (typeof msg === 'string') return msg;
    if (e.status === 401) return 'יש להתחבר כדי להשתמש בעוזר';
  }
  return 'שגיאה בחיבור. נסה שוב.';
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as any));

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await apiClient.post<{ reply: string; questionId?: string }>('/chat', {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages([...next, { role: 'assistant', content: res.reply, questionId: res.questionId }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: errorText(e) }]);
    } finally {
      setLoading(false);
    }
  }

  async function rate(index: number, value: 1 | -1) {
    const m = messages[index];
    if (!m.questionId || m.feedback) return;
    setMessages((prev) => prev.map((x, i) => (i === index ? { ...x, feedback: value } : x)));
    await apiClient.post('/chat/feedback', { questionId: m.questionId, value }).catch(() => {});
  }

  const header = (
    <LinearGradient colors={[brand.accent, brand.accentDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={goBack} />
        <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>שאל את StatsAI</Text>
        {messages.length > 0 ? (
          <Pressable onPress={() => setMessages([])} hitSlop={8} style={{ width: 40, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>חדש</Text>
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>
    </LinearGradient>
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <Text style={{ fontSize: 16, color: theme.ink[700], textAlign: 'center', writingDirection: 'rtl', lineHeight: 24 }}>
            העוזר עונה על שאלות מכל הנתונים — שחקנים, משחקים, טבלאות ושיאים. יש להתחבר כדי להשתמש בו.
          </Text>
          <Pressable onPress={() => router.push('/login' as any)} style={{ backgroundColor: brand.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>התחברות</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.canvas.start }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, color: theme.ink[700], textAlign: 'right', writingDirection: 'rtl', lineHeight: 22 }}>
              שאל כל שאלה על הנתונים, מכל השנים. לדוגמה:
            </Text>
            {EXAMPLES.map((q) => (
              <Pressable key={q} onPress={() => send(q)} style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: theme.ink[200], padding: 12 }}>
                <Text style={{ color: theme.ink[900], textAlign: 'right', writingDirection: 'rtl' }}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {messages.map((m, i) => {
          const mine = m.role === 'user';
          return (
            <View key={i} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '88%', gap: 4 }}>
              <View style={{ backgroundColor: mine ? brand.accent : 'white', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: mine ? 0 : 1, borderColor: theme.ink[200] }}>
                <RichText text={m.content} color={mine ? 'white' : theme.ink[900]} onLink={(p) => router.push(p as any)} />
              </View>
              {!mine && m.questionId && (
                <View style={{ flexDirection: rtlRow(), gap: 12, paddingHorizontal: 6 }}>
                  {([1, -1] as const).map((v) => (
                    <Pressable key={v} onPress={() => rate(i, v)} disabled={!!m.feedback} hitSlop={6}>
                      <Text style={{ fontSize: 16, opacity: m.feedback && m.feedback !== v ? 0.25 : 1 }}>{v === 1 ? '👍' : '👎'}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {loading && (
          <View style={{ alignSelf: 'flex-end', flexDirection: rtlRow(), alignItems: 'center', gap: 8, padding: 8 }}>
            <ActivityIndicator color={brand.accent} />
            <Text style={{ color: theme.ink[500], writingDirection: 'rtl' }}>בודק בנתונים…</Text>
          </View>
        )}
      </ScrollView>
      <View style={{ flexDirection: rtlRow(), alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: 'white', borderTopWidth: 1, borderTopColor: theme.ink[200] }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="שאל שאלה…"
          placeholderTextColor={theme.ink[500]}
          multiline
          maxLength={500}
          style={{ flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 12, backgroundColor: theme.ink[100], paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 15, textAlign: 'right', writingDirection: 'rtl', color: theme.ink[900] }}
        />
        <Pressable
          onPress={() => send()}
          disabled={!input.trim() || loading}
          style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', backgroundColor: !input.trim() || loading ? theme.ink[300] : brand.accent }}
        >
          <Text style={{ color: 'white', fontWeight: '800' }}>שלח</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI, type ChatMessage } from '@/lib/ai-providers';
import { reserveChatRequest } from '@/lib/ai-chat-quota';

// Rate limiting: 10 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  record.count++;
  return record.count <= RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  // Auth check
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'יש להתחבר כדי להשתמש בעוזר' }, { status: 401 });
  }

  // Rate limit
  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד דקה.' }, { status: 429 });
  }

  // Bound bytes as they arrive, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (!reader) return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 });
  let body: unknown;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) {
        await reader.cancel();
        return NextResponse.json({ error: 'הבקשה גדולה מדי' }, { status: 413 });
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  const input = body as { messages?: unknown } | null;
  if (!input?.messages || !Array.isArray(input.messages) || input.messages.length === 0) {
    return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 });
  }

  // Assistant replies may exceed the user input limit; bound both roles and
  // the entire context, including fabricated history supplied by the client.
  const messages: ChatMessage[] = [];
  let totalChars = 0;
  for (const m of input.messages) {
    if (!m || typeof m !== 'object' ||
        (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' ||
        !m.content.trim() || m.content.length > (m.role === 'user' ? 500 : 8000)) {
      return NextResponse.json({ error: 'הודעה לא תקינה או ארוכה מדי' }, { status: 400 });
    }
    totalChars += m.content.length;
    messages.push({ role: m.role, content: m.content });
  }
  if (messages.length > 20 || totalChars > 16000 || messages.at(-1)?.role !== 'user') {
    return NextResponse.json({ error: 'השיחה ארוכה מדי. יש להתחיל שיחה חדשה.' }, { status: 400 });
  }

  // Load AI settings
  const settings = await getAiSettings();
  const apiKey = await getActiveApiKey(settings);

  if (!apiKey) {
    return NextResponse.json({ error: 'עוזר הAI אינו פעיל כרגע' }, { status: 503 });
  }

  try {
    if (!await reserveChatRequest(user.id)) {
      return NextResponse.json({ error: 'מכסת השימוש היומית מוצתה. אפשר לנסות שוב מחר.' }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: 'עוזר ה־AI אינו זמין כרגע' }, { status: 503 });
  }

  try {
    const reply =
      settings.provider === 'openai'
        ? await chatWithOpenAI(apiKey, messages)
        : await chatWithClaude(apiKey, messages);

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('AI chat error:', err?.message || err);
    return NextResponse.json({ error: 'שגיאה בעיבוד השאלה. נסה שוב.' }, { status: 500 });
  }
}

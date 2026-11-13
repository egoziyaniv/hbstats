'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string; questionId?: string; feedback?: 1 | -1 };

// Answers may carry **bold** and [text](/games/…) links; anything else stays plain text.
function renderRich(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)\s]+\))/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((\/[^)\s]+)\)$/);
    if (link) return <a key={i} href={link[2]} className="font-bold underline" style={{ color: 'var(--accent)' }}>{link[1]}</a>;
    return part;
  });
}

type Viewer = { id: string; name: string; role: string } | null;

export default function AiChat() {
  const [viewer, setViewer] = useState<Viewer>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch current user
  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => setViewer(d.user || null))
      .catch(() => setViewer(null));
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.slice(-20).map(({ role, content }) => ({ role, content })) }),
      });

      const data = await res.json();

      if (res.ok && data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply, questionId: data.questionId || undefined }]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: data.error || 'שגיאה בעיבוד השאלה.' },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'שגיאת רשת. נסה שוב.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function sendFeedback(index: number, value: 1 | -1) {
    const msg = messages[index];
    if (!msg?.questionId || msg.feedback) return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedback: value } : m)));
    await fetch('/api/ai/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: msg.questionId, value }),
    }).catch(() => undefined);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 left-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ backgroundColor: 'var(--accent)' }}
        title="עוזר סטטיסטיקות"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 left-5 z-[60] flex h-[500px] w-[380px] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 text-white" style={{ backgroundColor: 'var(--accent)' }}>
            <span className="text-sm font-bold">עוזר סטטיסטיקות</span>
            <button onClick={() => setIsOpen(false)} className="rounded p-1 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!viewer ? (
            /* Guest message */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <MessageCircle className="h-10 w-10 text-stone-300" />
              <p className="text-sm font-semibold text-stone-700">העוזר החכם זמין לחברים רשומים בלבד</p>
              <p className="text-xs text-stone-400">הירשם או התחבר כדי לשאול שאלות על כדורגל ישראלי</p>
              <div className="flex gap-2">
                <a href="/login" className="rounded-full px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: 'var(--accent)' }}>כניסה</a>
                <a href="/register" className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700">הרשמה</a>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && (
                  <div className="mt-8 text-center text-sm text-stone-400">
                    שאל אותי על כדורגל ישראלי — שחקנים, משחקים, טבלאות ועוד
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'text-white'
                          : 'bg-stone-100 text-stone-800'
                      }`}
                      style={msg.role === 'user' ? { backgroundColor: 'var(--accent)' } : undefined}
                    >
                      {msg.role === 'assistant' ? renderRich(msg.content) : msg.content}
                      {msg.role === 'assistant' && msg.questionId ? (
                        <div className="mt-1.5 flex items-center gap-2 text-stone-400">
                          {msg.feedback ? (
                            <span className="text-xs">תודה על המשוב</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => sendFeedback(i, 1)} className="rounded p-0.5 hover:text-emerald-600" title="תשובה טובה"><ThumbsUp className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => sendFeedback(i, -1)} className="rounded p-0.5 hover:text-red-600" title="תשובה לא נכונה"><ThumbsDown className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-2 text-stone-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">חושב...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-stone-200 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="שאל שאלה..."
                    rows={1}
                    maxLength={500}
                    disabled={isLoading}
                    className="flex-1 resize-none rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-[var(--accent)] disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

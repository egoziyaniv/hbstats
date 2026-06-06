'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gsi load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gsi load failed'));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_WEB;

  useEffect(() => {
    if (!clientId || !ref.current) return undefined;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !window.google || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential: string }) => {
            setError('');
            const r = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: resp.credential }),
            });
            if (r.ok) {
              const data = await r.json().catch(() => ({}));
              router.push(data.user?.role === 'ADMIN' ? '/admin' : '/');
              router.refresh();
            } else {
              setError('ההתחברות עם Google נכשלה.');
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 320,
          locale: 'he',
        });
      })
      .catch(() => setError('טעינת Google נכשלה.'));

    return () => {
      cancelled = true;
    };
  }, [clientId, router]);

  if (!clientId) return null;

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-3 text-xs font-medium text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        או
        <span className="h-px flex-1 bg-stone-200" />
      </div>
      <div ref={ref} className="flex justify-center" />
      {error ? <p className="mt-2 text-center text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

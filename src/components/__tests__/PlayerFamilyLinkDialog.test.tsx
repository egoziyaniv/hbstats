import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
import PlayerFamilyLinkDialog from '@/components/PlayerFamilyLinkDialog';

test('renders the existing-player link confirmation for a self-link repair', () => {
  const html = renderToStaticMarkup(<PlayerFamilyLinkDialog source={{ id: 'source', nameHe: 'נועם בן הרוש', nameEn: 'Noam Ben Harosh', updatedAt: '2026-09-29T10:00:00.000Z' }} target={{ id: 'root', nameHe: 'נועם בן הרוש', nameEn: 'N. Ben Harush', updatedAt: '2026-09-29T10:00:00.000Z' }} />);
  for (const text of ['קישור למשפחה קיימת', 'קישור לרשומת שחקן קיימת']) expect(html).toContain(text);
});

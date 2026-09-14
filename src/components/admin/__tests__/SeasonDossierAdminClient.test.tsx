import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SeasonDossierAdminClient from '@/components/admin/SeasonDossierAdminClient';
import type { SeasonDossierMetric, SeasonDossierMetricKey, SeasonDossierPayload } from '@shared/types/mobile-api';

const metric = <K extends SeasonDossierMetricKey>(key: K, value: number): SeasonDossierMetric<K> => ({
  key, value, definitionHe: 'הגדרה', coverage: 'COMPLETE' as const,
  computedAt: '2026-09-14T00:00:00.000Z', competitionBreakdown: [], evidenceGameIds: [],
});

const dossier = {
  season: { id: 'season-2026', year: 2026, name: '2026/27' },
  team: { id: 'team-hbs', apiId: 563, nameEn: 'Hapoel Beer Sheva', nameHe: 'הפועל באר שבע', logoUrl: null },
  status: 'CURRENT', asOf: '2026-09-14T00:00:00.000Z',
  editorial: { introHe: 'הפתיח', summaryHe: 'הסיכום', heroImageUrl: null },
  metrics: [metric('matches', 12), metric('wins', 8), metric('goalsFor', 25), metric('leaguePosition', 1)],
  sources: [], moments: [], squad: [], coach: null, standing: null, honors: [], competitions: [], games: [],
} satisfies SeasonDossierPayload;

describe('SeasonDossierAdminClient', () => {
  it('renders independent story, moments and sources editors with read-only metrics', () => {
    const html = renderToStaticMarkup(
      <SeasonDossierAdminClient seasonId="season-2026" initialDossier={dossier} initialPublication={{ isPublished: false, publishedAt: null }} initialMomentAdmin={{}} />,
    );
    expect(html).toContain('סיפור העונה');
    expect(html).toContain('טיוטה');
    expect(html).toContain('ציר הזמן');
    expect(html).toContain('הוספת רגע');
    expect(html).toContain('מקורות וכיסוי');
    expect(html).toContain('הוספת מקור');
    expect(html).toContain('הערכים נגזרים ממשחקים וטבלאות ואינם ניתנים לעריכה כאן');
    expect(html).toContain('>12<');
    expect(html).not.toMatch(/<input[^>]+value="12"/);
  });
});

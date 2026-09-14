import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SeasonDossierClient, { SeasonDossierEvidence } from '@/components/SeasonDossierClient';
import type { SeasonDossierMetric, SeasonDossierPayload } from '@shared/types/mobile-api';

const source = { id: 'src1', momentId: null, labelHe: 'דו״ח ההתאחדות', provider: 'IFA', url: 'https://football.org.il/a', scope: 'BOTH', competitionId: 'league', coverageStatus: 'COMPLETE', coverageFrom: '2026-07-01T00:00:00.000Z', coverageTo: '2027-06-30T00:00:00.000Z', verifiedAt: '2027-06-30T00:00:00.000Z', noteHe: 'כיסוי משחקי ליגה' } as const;
const game = { id: 'g1', dateTime: '2026-08-17T18:00:00.000Z', status: 'finished', competitionId: 'league', competitionNameHe: 'ליגת העל', roundNameHe: 'מחזור 1', isHome: true, opponent: { id: 'opp', apiId: 1, nameEn: 'Opponent', nameHe: 'יריבה', logoUrl: null }, goalsFor: 2, goalsAgainst: 0, result: 'W' } as const;
const metric = <K extends SeasonDossierMetric['key']>(key: K, value: number | null): SeasonDossierMetric<K> => ({ key, value, definitionHe: 'משחקים רשמיים בלבד', coverage: 'COMPLETE', computedAt: '2026-09-14T00:00:00.000Z', competitionBreakdown: [{ competitionId: 'league', competitionNameHe: 'ליגת העל', value, coverage: 'COMPLETE' }], evidenceGameIds: ['g1'] });
const dossier = {
  season: { id: 's2026', year: 2026, name: '2026/27' }, team: { id: 'hbs', apiId: 563, nameEn: 'Hapoel Beer Sheva', nameHe: 'הפועל באר שבע', logoUrl: null },
  status: 'CURRENT', asOf: '2026-09-14T00:00:00.000Z', editorial: { introHe: 'עונה חדשה יוצאת לדרך', summaryHe: 'זהו סיפור העונה.', heroImageUrl: null },
  metrics: [metric('matches', 4), metric('wins', 3), metric('goalsFor', 9), metric('leaguePosition', null)],
  sources: [source], moments: [{ id: 'm1', eventDate: '2026-08-17T00:00:00.000Z', titleHe: 'ערב פתיחה', bodyHe: 'ניצחון ראשון', imageUrl: null, displayOrder: 0, game, sources: [source] }],
  squad: [], coach: null, standing: null, honors: [], competitions: [{ id: 'league', nameHe: 'ליגת העל', nameEn: 'Premier League', logoUrl: null, type: 'LEAGUE' }], games: [{ competitionId: 'league', labelHe: 'מחזור 1', games: [game] }],
} satisfies SeasonDossierPayload;

describe('season dossier web', () => {
  it('renders story first, status, all sections, metric controls and null as unknown', () => {
    const html = renderToStaticMarkup(<SeasonDossierClient dossier={dossier} />);
    expect(html).toContain('עונה נוכחית');
    expect((html.match(/aria-expanded="false"/g) || [])).toHaveLength(4);
    expect(html).toContain('לא ידוע');
    expect(html.indexOf('הסיפור של העונה')).toBeLessThan(html.indexOf('הרגעים שעיצבו את העונה'));
    expect(html.indexOf('הרגעים שעיצבו את העונה')).toBeLessThan(html.indexOf('הסגל'));
    expect(html).toContain('/games/g1');
    expect(html).toContain('/games?season=s2026&amp;teamId=hbs');
  });

  it('renders the definition, coverage, source and evidence games', () => {
    const html = renderToStaticMarkup(<SeasonDossierEvidence metric={dossier.metrics[0]} dossier={dossier} />);
    expect(html).toContain('משחקים רשמיים בלבד');
    expect(html).toContain('כיסוי מלא');
    expect(html).toContain('https://football.org.il/a');
    expect(html).toContain('המשחקים שמרכיבים את הנתון');
    expect(html).toContain('/games/g1');
  });

  it('renders the final-season label', () => {
    const html = renderToStaticMarkup(<SeasonDossierClient dossier={{ ...dossier, status: 'FINAL' }} />);
    expect(html).toContain('עונה שהסתיימה');
  });
});

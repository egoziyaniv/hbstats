import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SeasonDossierBody } from '../[seasonId]';
import { seasonDossierRoute } from '../../seasons';
import type { SeasonDossierMetric, SeasonDossierPayload } from '@shared/types/mobile-api';

jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);

const metric = <K extends SeasonDossierMetric['key']>(key: K, value: number | null): SeasonDossierMetric<K> => ({ key, value, definitionHe: 'הגדרת המדד', coverage: 'COMPLETE', computedAt: '2026-09-14T00:00:00.000Z', competitionBreakdown: [], evidenceGameIds: ['g1'] });
const dossier = {
  season: { id: 's1', year: 2026, name: '2026/27' }, team: { id: 'hbs', apiId: 563, nameEn: 'HBS', nameHe: 'הפועל באר שבע', logoUrl: null }, status: 'CURRENT', asOf: '2026-09-14T00:00:00.000Z', editorial: { introHe: 'פתיח', summaryHe: 'סיפור', heroImageUrl: null },
  metrics: [metric('matches', 4), metric('wins', 3), metric('goalsFor', 8), metric('leaguePosition', null)],
  sources: [{ id: 'src1', momentId: null, labelHe: 'מקור רשמי', provider: 'IFA', url: 'https://football.org.il/a', scope: 'METRICS', competitionId: null, coverageStatus: 'COMPLETE', coverageFrom: null, coverageTo: null, verifiedAt: null, noteHe: null }],
  moments: [], squad: [], coach: null, standing: null, honors: [], competitions: [], games: [{ competitionId: 'league', labelHe: 'מחזור 1', games: [{ id: 'g1', dateTime: '2026-08-17T00:00:00.000Z', status: 'finished', competitionId: 'league', competitionNameHe: 'ליגה', roundNameHe: 'מחזור 1', isHome: true, opponent: { id: 'opp', apiId: 1, nameEn: 'Opponent', nameHe: 'יריבה', logoUrl: null }, goalsFor: 2, goalsAgainst: 0, result: 'W' }] }],
} satisfies SeasonDossierPayload;

describe('SeasonDossierBody', () => {
  test('routes pilot and explicitly available historic seasons to dossiers', () => {
    expect(seasonDossierRoute('season 2026', 2026)).toBe('/club/seasons/season%202026');
    expect(seasonDossierRoute('s2025', 2025)).toBe('/club/seasons/s2025');
    expect(seasonDossierRoute('s2024', 2024)).toBeNull();
    expect(seasonDossierRoute('historic', 2015, true)).toBe('/club/seasons/historic');
    expect(seasonDossierRoute('draft', 2015, false)).toBeNull();
    expect(seasonDossierRoute('hidden-pilot', 2026, false)).toBeNull();
  });
  test('renders current/final labels and opens a dismissible RTL evidence modal', () => {
    const onGamePress = jest.fn();
    const view = render(<SeasonDossierBody dossier={dossier} onGamePress={onGamePress} />);
    expect(view.getByText('עונה נוכחית')).toBeTruthy();
    expect(view.getByText('לא ידוע')).toBeTruthy();
    fireEvent.press(view.getByLabelText('מאיפה המספר: משחקים'));
    expect(view.getByText('הגדרת המדד')).toBeTruthy();
    fireEvent.press(view.getByText('מקור רשמי'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://football.org.il/a');
    fireEvent.press(view.getByLabelText('סגירת פירוט המדד'));
    expect(view.queryByText('הגדרת המדד')).toBeNull();
    view.rerender(<SeasonDossierBody dossier={{ ...dossier, status: 'FINAL' }} onGamePress={onGamePress} />);
    expect(view.getByText('עונה שהסתיימה')).toBeTruthy();
  });
});

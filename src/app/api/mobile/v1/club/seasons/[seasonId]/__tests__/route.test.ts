jest.mock('@/lib/season-dossier', () => ({
  __esModule: true,
  buildSeasonDossier: jest.fn(),
}));

import { buildSeasonDossier } from '@/lib/season-dossier';
import { GET } from '../route';
import type { SeasonDossierPayload } from '@shared/types/mobile-api';

const mockBuildSeasonDossier = buildSeasonDossier as jest.Mock;

describe('GET /api/mobile/v1/club/seasons/:seasonId', () => {
  beforeEach(() => mockBuildSeasonDossier.mockReset());

  it('awaits params and returns the public dossier contract', async () => {
    const payload = {
      season: { id: 'season-2026', year: 2026, name: '2026/27' },
      team: { id: 'team-bs', apiId: 563, nameEn: 'Hapoel Beer Sheva', nameHe: 'הפועל באר שבע', logoUrl: null },
      status: 'CURRENT',
      asOf: '2026-09-14T08:00:00.000Z',
      editorial: null,
      metrics: [
        { key: 'matches', definitionHe: 'משחקים', value: null, coverage: 'UNKNOWN', computedAt: '2026-09-14T08:00:00.000Z', competitionBreakdown: [], evidenceGameIds: [] },
        { key: 'wins', definitionHe: 'ניצחונות', value: null, coverage: 'UNKNOWN', computedAt: '2026-09-14T08:00:00.000Z', competitionBreakdown: [], evidenceGameIds: [] },
        { key: 'goalsFor', definitionHe: 'שערים', value: null, coverage: 'UNKNOWN', computedAt: '2026-09-14T08:00:00.000Z', competitionBreakdown: [], evidenceGameIds: [] },
        { key: 'leaguePosition', definitionHe: 'מיקום', value: null, coverage: 'UNKNOWN', computedAt: '2026-09-14T08:00:00.000Z', competitionBreakdown: [], evidenceGameIds: [] },
      ],
      moments: [],
      sources: [],
      squad: [],
      coach: null,
      standing: null,
      honors: [],
      competitions: [],
      games: [],
    } satisfies SeasonDossierPayload;
    mockBuildSeasonDossier.mockResolvedValue(payload);

    const response = await GET(new Request('http://localhost/api/mobile/v1/club/seasons/season-2026'), {
      params: Promise.resolve({ seasonId: 'season-2026' }),
    });

    expect(mockBuildSeasonDossier).toHaveBeenCalledWith('season-2026');
    expect(mockBuildSeasonDossier).not.toHaveBeenCalledWith('season-2026', { includeDrafts: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
  });

  it('returns the stable 404 contract when the service rejects the season', async () => {
    mockBuildSeasonDossier.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/mobile/v1/club/seasons/other'), {
      params: Promise.resolve({ seasonId: 'other' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Season dossier not found' });
  });
});

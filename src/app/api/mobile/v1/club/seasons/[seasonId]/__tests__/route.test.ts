jest.mock('@/lib/season-dossier', () => ({
  __esModule: true,
  buildSeasonDossier: jest.fn(),
}));

import { buildSeasonDossier } from '@/lib/season-dossier';
import { GET } from '../route';

const mockBuildSeasonDossier = buildSeasonDossier as jest.Mock;

describe('GET /api/mobile/v1/club/seasons/:seasonId', () => {
  beforeEach(() => mockBuildSeasonDossier.mockReset());

  it('awaits params and returns the public dossier contract', async () => {
    mockBuildSeasonDossier.mockResolvedValue({
      season: { id: 'season-2026', year: 2026, name: '2026/27' },
      status: 'CURRENT',
      editorial: null,
      moments: [],
      sources: [],
    });

    const response = await GET(new Request('http://localhost/api/mobile/v1/club/seasons/season-2026'), {
      params: Promise.resolve({ seasonId: 'season-2026' }),
    });

    expect(mockBuildSeasonDossier).toHaveBeenCalledWith('season-2026');
    expect(mockBuildSeasonDossier).not.toHaveBeenCalledWith('season-2026', { includeDrafts: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'CURRENT',
      editorial: null,
      moments: [],
      sources: [],
    });
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

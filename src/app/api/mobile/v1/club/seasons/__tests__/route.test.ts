import { GET } from '../route';
import { buildClubSeasons } from '@/lib/club-hub';
import prisma from '@/lib/prisma';
jest.mock('@/lib/club-hub', () => ({ buildClubSeasons: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { clubSeasonDossier: { findMany: jest.fn() } } }));
it('advertises pilot and published historic dossiers without exposing draft availability', async () => {
  (buildClubSeasons as jest.Mock).mockResolvedValue([{ seasonId: 'pilot', year: 2026 }, { seasonId: 'published', year: 2015 }, { seasonId: 'draft', year: 2014 }]);
  (prisma.clubSeasonDossier.findMany as jest.Mock).mockResolvedValue([{ seasonId: 'published' }]);
  const response = await GET();
  expect((await response.json()).seasons).toEqual([
    { seasonId: 'pilot', year: 2026, dossierAvailable: true },
    { seasonId: 'published', year: 2015, dossierAvailable: true },
    { seasonId: 'draft', year: 2014, dossierAvailable: false },
  ]);
  expect(prisma.clubSeasonDossier.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublished: true, team: { apiFootballId: 563 } } }));
});

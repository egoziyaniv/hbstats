import prisma from '@/lib/prisma';
import { buildSeasonDossier } from '@/lib/season-dossier';
import { validateMomentLinks } from '@/lib/season-dossier-admin';
import { SeasonDossierValidationError } from '@/lib/season-dossier-validation';

const enabled = process.env.STATSAI_SEASON_DOSSIER_INTEGRATION === '1';
const describeIntegration = enabled ? describe : describe.skip;
const ids = {
  competition: 'itest_dossier_competition', opponent: 'itest_dossier_opponent',
  otherTeamA: 'itest_dossier_other_a', otherTeamB: 'itest_dossier_other_b',
  win: 'itest_dossier_game_win', draw: 'itest_dossier_game_draw', foreign: 'itest_dossier_game_foreign',
  dossier: 'itest_dossier_main', otherDossier: 'itest_dossier_other', moment: 'itest_dossier_moment',
  otherMoment: 'itest_dossier_other_moment', metricSource: 'itest_dossier_metric_source', momentSource: 'itest_dossier_moment_source',
};

function assertIsolatedDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required');
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || database !== 'statsai_review') {
    throw new Error('Integration test requires localhost/statsai_review');
  }
}

describeIntegration('season dossier PostgreSQL integration', () => {
  jest.setTimeout(30_000);
  let season2026: { id: string; startDate: Date; endDate: Date };
  let season2025: { id: string };
  let hbs: { id: string };

  beforeAll(async () => {
    assertIsolatedDatabase();
    season2026 = await prisma.season.upsert({
      where: { year: 2026 },
      create: { id: 'itest_season_2026', year: 2026, name: '2026/27', startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2027-06-30T00:00:00Z') },
      update: { name: '2026/27', startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2027-06-30T00:00:00Z') },
      select: { id: true, startDate: true, endDate: true },
    });
    season2025 = await prisma.season.upsert({
      where: { year: 2025 },
      create: { id: 'itest_season_2025', year: 2025, name: '2025/26', startDate: new Date('2025-07-01T00:00:00Z'), endDate: new Date('2026-06-30T00:00:00Z') },
      update: {}, select: { id: true },
    });
    hbs = await prisma.team.upsert({
      where: { apiFootballId_seasonId: { apiFootballId: 563, seasonId: season2026.id } },
      create: { id: 'itest_dossier_hbs', seasonId: season2026.id, apiFootballId: 563, nameEn: 'Hapoel Beer Sheva', nameHe: 'הפועל באר שבע' },
      update: {}, select: { id: true },
    });
    await prisma.clubSeasonDossier.deleteMany({ where: { seasonId: season2026.id, teamId: { in: [hbs.id, ids.opponent] } } });
    await prisma.game.deleteMany({ where: { id: { in: [ids.win, ids.draw, ids.foreign] } } });
    await prisma.team.deleteMany({ where: { id: { in: [ids.opponent, ids.otherTeamA, ids.otherTeamB] } } });
    await prisma.competitionSeason.deleteMany({ where: { competitionId: ids.competition } });
    await prisma.competition.deleteMany({ where: { id: ids.competition } });

    await prisma.competition.create({ data: { id: ids.competition, apiFootballId: 990001, nameEn: 'Integration League', nameHe: 'ליגת אינטגרציה', type: 'LEAGUE' } });
    await prisma.competitionSeason.create({ data: { competitionId: ids.competition, seasonId: season2026.id } });
    await prisma.team.create({ data: { id: ids.opponent, seasonId: season2026.id, apiFootballId: 990002, nameEn: 'Test Opponent', nameHe: 'יריבת בדיקה' } });
    await prisma.team.createMany({ data: [
      { id: ids.otherTeamA, seasonId: season2025.id, apiFootballId: 990003, nameEn: 'Other A', nameHe: 'אחרת א' },
      { id: ids.otherTeamB, seasonId: season2025.id, apiFootballId: 990004, nameEn: 'Other B', nameHe: 'אחרת ב' },
    ] });
    await prisma.game.createMany({ data: [
      { id: ids.win, seasonId: season2026.id, competitionId: ids.competition, dateTime: new Date('2026-08-01T18:00:00Z'), status: 'COMPLETED', homeTeamId: hbs.id, awayTeamId: ids.opponent, homeScore: 2, awayScore: 0 },
      { id: ids.draw, seasonId: season2026.id, competitionId: ids.competition, dateTime: new Date('2026-08-08T18:00:00Z'), status: 'COMPLETED', homeTeamId: ids.opponent, awayTeamId: hbs.id, homeScore: 1, awayScore: 1 },
      { id: ids.foreign, seasonId: season2025.id, dateTime: new Date('2025-08-01T18:00:00Z'), status: 'COMPLETED', homeTeamId: ids.otherTeamA, awayTeamId: ids.otherTeamB, homeScore: 1, awayScore: 0 },
    ] });
  });

  afterAll(async () => {
    await prisma.clubSeasonDossier.deleteMany({ where: { id: { in: [ids.dossier, ids.otherDossier] } } });
    await prisma.game.deleteMany({ where: { id: { in: [ids.win, ids.draw, ids.foreign] } } });
    await prisma.team.deleteMany({ where: { id: { in: [ids.opponent, ids.otherTeamA, ids.otherTeamB] } } });
    await prisma.competitionSeason.deleteMany({ where: { competitionId: ids.competition } });
    await prisma.competition.deleteMany({ where: { id: ids.competition } });
    await prisma.$disconnect();
  });

  it('filters drafts, keeps metric evidence aligned, rejects cross-links and cascades only editorial rows', async () => {
    await prisma.clubSeasonDossier.create({ data: { id: ids.dossier, seasonId: season2026.id, teamId: hbs.id, introHe: 'טיוטה', isPublished: false } });
    await prisma.clubSeasonMoment.create({ data: { id: ids.moment, dossierId: ids.dossier, eventDate: new Date('2026-08-01T00:00:00Z'), titleHe: 'רגע', bodyHe: 'תיאור', gameId: ids.win, isPublished: true } });
    await prisma.clubSeasonSource.create({ data: { id: ids.metricSource, dossierId: ids.dossier, labelHe: 'מקור', provider: 'בדיקה', url: 'https://example.test/source', scope: 'METRICS', competitionId: ids.competition, coverageStatus: 'COMPLETE', coverageFrom: season2026.startDate, coverageTo: season2026.endDate, verifiedAt: season2026.endDate } });

    const publicDraft = await buildSeasonDossier(season2026.id);
    const adminDraft = await buildSeasonDossier(season2026.id, { includeDrafts: true });
    expect(publicDraft?.editorial).toBeNull();
    expect(publicDraft?.moments).toEqual([]);
    expect(adminDraft?.editorial?.introHe).toBe('טיוטה');
    expect(adminDraft?.moments.map((moment) => moment.id)).toEqual([ids.moment]);

    await prisma.clubSeasonDossier.update({ where: { id: ids.dossier }, data: { isPublished: true, publishedAt: new Date() } });
    const published = await buildSeasonDossier(season2026.id);
    const matches = published?.metrics[0];
    expect(matches?.value).toBe(2);
    expect(matches?.coverage).toBe('COMPLETE');
    expect(new Set(matches?.evidenceGameIds)).toEqual(new Set([ids.win, ids.draw]));

    await prisma.clubSeasonDossier.create({ data: { id: ids.otherDossier, seasonId: season2026.id, teamId: ids.opponent } });
    await prisma.clubSeasonMoment.create({ data: { id: ids.otherMoment, dossierId: ids.otherDossier, eventDate: new Date('2026-08-02T00:00:00Z'), titleHe: 'אחר', bodyHe: 'אחר' } });
    await expect(prisma.clubSeasonSource.create({ data: { id: ids.momentSource, dossierId: ids.dossier, momentId: ids.otherMoment, labelHe: 'פסול', provider: 'בדיקה', url: 'https://example.test', scope: 'EDITORIAL' } })).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.$transaction((tx) => validateMomentLinks(tx, { season: { id: season2026.id }, team: { id: hbs.id } }, { gameId: ids.foreign, mediaAssetId: null }))).rejects.toBeInstanceOf(SeasonDossierValidationError);

    await prisma.clubSeasonSource.create({ data: { id: ids.momentSource, dossierId: ids.dossier, momentId: ids.moment, labelHe: 'מקור רגע', provider: 'בדיקה', url: 'https://example.test/moment', scope: 'EDITORIAL' } });
    await prisma.clubSeasonMoment.delete({ where: { id: ids.moment } });
    expect(await prisma.clubSeasonSource.findUnique({ where: { id: ids.momentSource } })).toBeNull();
    expect(await prisma.clubSeasonDossier.findUnique({ where: { id: ids.dossier } })).not.toBeNull();
    expect(await prisma.game.findUnique({ where: { id: ids.win } })).not.toBeNull();
  });
});

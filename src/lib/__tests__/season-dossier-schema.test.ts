import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  SeasonDossierCompetition,
  SeasonDossierEvidenceGame,
  SeasonDossierMetric,
  SeasonDossierMoment,
  SeasonDossierPayload,
  SeasonDossierStatus,
} from '@shared/types/mobile-api';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const mobileApiTypes = readFileSync(join(process.cwd(), 'shared/types/mobile-api.ts'), 'utf8');

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type MetricComputedAtIsRequiredString = Assert<IsEqual<SeasonDossierMetric['computedAt'], string>>;
type MomentBodyIsRequiredString = Assert<IsEqual<SeasonDossierMoment['bodyHe'], string>>;
type CompetitionKindIsExplicit = Assert<
  IsEqual<SeasonDossierCompetition['type'], 'LEAGUE' | 'CUP' | 'EUROPE'>
>;
type SeasonStateIsExplicit = Assert<IsEqual<SeasonDossierStatus, 'CURRENT' | 'FINAL'>>;

const contractAssertions: [
  MetricComputedAtIsRequiredString,
  MomentBodyIsRequiredString,
  CompetitionKindIsExplicit,
  SeasonStateIsExplicit,
] = [true, true, true, true];

function schemaBlock(kind: 'model' | 'enum', name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
}

const evidenceGameFixture = {
  id: 'game-1',
  dateTime: '2026-08-22T17:00:00.000Z',
  status: 'finished',
  competitionId: 'competition-league',
  competitionNameHe: 'ליגת העל',
  roundNameHe: 'מחזור 1',
  isHome: true,
  opponent: {
    id: 'opponent-1',
    apiId: null,
    nameHe: 'קבוצה אורחת',
    nameEn: 'Away Team',
    logoUrl: null,
  },
  goalsFor: 2,
  goalsAgainst: 0,
  result: 'W',
} satisfies SeasonDossierEvidenceGame;

const nonNullEditorialFixture = {
  introHe: 'פתיחת עונת 2026/27.',
  summaryHe: null,
  heroImageUrl: null,
} satisfies NonNullable<SeasonDossierPayload['editorial']>;

const payloadFixture = {
  season: { id: 'season-2026', year: 2026, name: '2026/27' },
  team: {
    id: 'team-hbs-2026',
    apiId: null,
    nameHe: 'הפועל באר שבע',
    nameEn: 'Hapoel Beer Sheva',
    logoUrl: null,
  },
  status: 'CURRENT',
  asOf: '2026-09-13T09:00:00.000Z',
  editorial: null,
  metrics: [
    {
      key: 'matches',
      definitionHe: 'כל המשחקים הרשמיים שנכללו בכיסוי.',
      value: 4,
      coverage: 'COMPLETE',
      computedAt: '2026-09-13T09:00:00.000Z',
      competitionBreakdown: [
        {
          competitionId: 'competition-league',
          competitionNameHe: 'ליגת העל',
          value: 4,
          coverage: 'COMPLETE',
        },
      ],
      evidenceGameIds: ['game-1'],
    },
    {
      key: 'wins',
      definitionHe: 'משחקים רשמיים שהסתיימו בניצחון.',
      value: 3,
      coverage: 'COMPLETE',
      computedAt: '2026-09-13T09:00:00.000Z',
      competitionBreakdown: [],
      evidenceGameIds: ['game-1'],
    },
    {
      key: 'goalsFor',
      definitionHe: 'שערי הקבוצה במשחקים הרשמיים שנכללו בכיסוי.',
      value: 9,
      coverage: 'PARTIAL',
      computedAt: '2026-09-13T09:00:00.000Z',
      competitionBreakdown: [],
      evidenceGameIds: ['game-1'],
    },
    {
      key: 'leaguePosition',
      definitionHe: 'המיקום האחרון בטבלת הליגה.',
      value: 1,
      coverage: 'UNKNOWN',
      computedAt: '2026-09-13T09:00:00.000Z',
      competitionBreakdown: [],
      evidenceGameIds: [],
    },
  ],
  sources: [],
  moments: [
    {
      id: 'moment-1',
      eventDate: '2026-08-22T17:00:00.000Z',
      titleHe: 'ניצחון במחזור הפתיחה',
      bodyHe: 'הקבוצה פתחה את העונה בניצחון ביתי.',
      imageUrl: null,
      displayOrder: 0,
      game: evidenceGameFixture,
      sources: [],
    },
  ],
  squad: [
    {
      playerId: 'player-1',
      nameHe: 'שחקן לדוגמה',
      nameEn: 'Example Player',
      photoUrl: null,
      position: 'Midfielder',
      jerseyNumber: 8,
      appearances: 4,
      starts: 4,
      minutes: 360,
      goals: 1,
      assists: 2,
    },
  ],
  coach: null,
  standing: {
    competitionId: 'competition-league',
    competitionNameHe: 'ליגת העל',
    position: 1,
    played: 4,
    wins: 3,
    draws: 1,
    losses: 0,
    goalsFor: 9,
    goalsAgainst: 2,
    points: 10,
    coverage: 'COMPLETE',
  },
  honors: [{ competitionHe: 'אלוף האלופים', place: 'WINNER' }],
  competitions: [
    {
      id: 'competition-league',
      nameHe: 'ליגת העל',
      nameEn: 'Premier League',
      logoUrl: null,
      type: 'LEAGUE',
    },
  ],
  games: [
    {
      competitionId: 'competition-league',
      labelHe: 'מחזור 1',
      games: [evidenceGameFixture],
    },
  ],
} satisfies SeasonDossierPayload;

describe('season dossier schema contract', () => {
  it('defines the dossier, moment, and source models with ownership and query indexes', () => {
    const team = schemaBlock('model', 'Team');
    const dossier = schemaBlock('model', 'ClubSeasonDossier');
    const moment = schemaBlock('model', 'ClubSeasonMoment');
    const source = schemaBlock('model', 'ClubSeasonSource');

    expect(team).toContain('@@unique([id, seasonId])');
    expect(dossier).toContain('@@unique([seasonId, teamId])');
    expect(dossier).toContain('@@index([seasonId])');
    expect(dossier).toContain('@@index([teamId])');
    expect(dossier).toMatch(/season\s+Season\s+@relation\([^\n]*onDelete: Restrict\)/);
    expect(dossier).toMatch(
      /team\s+Team\s+@relation\(fields: \[teamId, seasonId\], references: \[id, seasonId\], onDelete: Restrict\)/,
    );

    expect(moment).toMatch(/dossier\s+ClubSeasonDossier\s+@relation\([^\n]*onDelete: Cascade\)/);
    expect(moment).toMatch(/game\s+Game\?\s+@relation\([^\n]*onDelete: SetNull\)/);
    expect(moment).toMatch(/mediaAsset\s+MediaAsset\?\s+@relation\([^\n]*onDelete: SetNull\)/);
    expect(moment).toMatch(/bodyHe\s+String(?:\s|$)/m);
    expect(moment).toContain('@@unique([id, dossierId])');
    expect(moment).toContain('@@index([dossierId, eventDate])');
    expect(moment).toContain('@@index([dossierId, displayOrder])');

    expect(source).toMatch(/dossier\s+ClubSeasonDossier\s+@relation\([^\n]*onDelete: Cascade\)/);
    expect(source).toMatch(
      /moment\s+ClubSeasonMoment\?\s+@relation\(fields: \[momentId, dossierId\], references: \[id, dossierId\], onDelete: Cascade\)/,
    );
    expect(source).toMatch(/competition\s+Competition\?\s+@relation\([^\n]*onDelete: SetNull\)/);
    expect(source).toContain('@@index([dossierId, scope])');
    expect(source).toContain('@@index([momentId])');
    expect(source).toContain('@@index([competitionId])');
  });

  it('defines source scope and data coverage enums', () => {
    expect(schemaBlock('enum', 'ClubSeasonSourceScope')).toMatch(
      /METRICS[\s\S]*EDITORIAL[\s\S]*BOTH/,
    );
    expect(schemaBlock('enum', 'DataCoverageStatus')).toMatch(
      /COMPLETE[\s\S]*PARTIAL[\s\S]*UNKNOWN/,
    );
  });

  it('keeps the shared payload contract type-checkable with exactly four metrics', () => {
    expect(payloadFixture.metrics).toHaveLength(4);
    expect(payloadFixture.games[0].games).toHaveLength(1);
    expect(nonNullEditorialFixture.introHe).toBeTruthy();
    expect(payloadFixture.competitions[0].type).toBe('LEAGUE');
    expect(payloadFixture.games[0].competitionId).toBe(payloadFixture.competitions[0].id);
    expect(mobileApiTypes).not.toContain('interface SeasonDossierCompetitionGroup');
    expect(contractAssertions).toEqual([true, true, true, true]);
  });
});

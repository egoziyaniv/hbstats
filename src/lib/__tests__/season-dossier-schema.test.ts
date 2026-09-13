import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SeasonDossierPayload } from '@shared/types/mobile-api';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

function schemaBlock(kind: 'model' | 'enum', name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
}

const payloadFixture = {
  season: { id: 'season-2026', year: 2026, name: '2026/27' },
  team: {
    id: 'team-hbs-2026',
    apiId: null,
    nameHe: 'הפועל באר שבע',
    nameEn: 'Hapoel Beer Sheva',
    logoUrl: null,
  },
  status: 'PUBLISHED',
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
      computedAt: null,
      competitionBreakdown: [],
      evidenceGameIds: [],
    },
  ],
  sources: [],
  moments: [],
  squad: [],
  coach: null,
  standing: null,
  honors: [],
  competitions: [
    {
      competition: {
        id: 'competition-league',
        nameHe: 'ליגת העל',
        nameEn: 'Premier League',
        logoUrl: null,
        type: 'LEAGUE',
      },
      gameGroups: [
        {
          labelHe: 'מחזור 1',
          games: [
            {
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
            },
          ],
        },
      ],
    },
  ],
} satisfies SeasonDossierPayload;

describe('season dossier schema contract', () => {
  it('defines the dossier, moment, and source models with ownership and query indexes', () => {
    const dossier = schemaBlock('model', 'ClubSeasonDossier');
    const moment = schemaBlock('model', 'ClubSeasonMoment');
    const source = schemaBlock('model', 'ClubSeasonSource');

    expect(dossier).toContain('@@unique([seasonId, teamId])');
    expect(dossier).toContain('@@index([seasonId])');
    expect(dossier).toContain('@@index([teamId])');
    expect(dossier).toMatch(/season\s+Season\s+@relation\([^\n]*onDelete: Restrict\)/);
    expect(dossier).toMatch(/team\s+Team\s+@relation\([^\n]*onDelete: Restrict\)/);

    expect(moment).toMatch(/dossier\s+ClubSeasonDossier\s+@relation\([^\n]*onDelete: Cascade\)/);
    expect(moment).toMatch(/game\s+Game\?\s+@relation\([^\n]*onDelete: SetNull\)/);
    expect(moment).toMatch(/mediaAsset\s+MediaAsset\?\s+@relation\([^\n]*onDelete: SetNull\)/);
    expect(moment).toMatch(/bodyHe\s+String(?:\s|$)/m);
    expect(moment).toContain('@@index([dossierId, eventDate])');
    expect(moment).toContain('@@index([dossierId, displayOrder])');

    expect(source).toMatch(/dossier\s+ClubSeasonDossier\s+@relation\([^\n]*onDelete: Cascade\)/);
    expect(source).toMatch(/moment\s+ClubSeasonMoment\?\s+@relation\([^\n]*onDelete: SetNull\)/);
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
  });
});

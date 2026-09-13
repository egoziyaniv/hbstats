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
  editorial: {
    introHe: 'פתיחת עונת 2026/27.',
    summaryHe: null,
    heroImageUrl: null,
  },
  metrics: [
    { key: 'matches', value: 4, coverage: 'COMPLETE' },
    { key: 'wins', value: 3, coverage: 'COMPLETE' },
    { key: 'goalsFor', value: 9, coverage: 'PARTIAL' },
    { key: 'leaguePosition', value: 1, coverage: 'UNKNOWN' },
  ],
  sources: [],
  moments: [],
  squad: [],
  coach: null,
  standing: null,
  honors: [],
  competitions: [],
  games: [],
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

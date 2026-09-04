// src/lib/club-hub.ts — assemble the Beer Sheva club knowledge hub
// (honors board + hall of fame + club-page list). Shared by web + mobile.
import prisma from '@/lib/prisma';
import type {
  ClubHubPayload,
  ClubHonorGroup,
  HallOfFameItem,
  ClubPageSummary,
  ClubPageDetail,
} from '@shared/types/mobile-api';

// Competition display order (most prestigious first).
const COMP_ORDER = ['ליגת העל', 'גביע המדינה', 'אלוף האלופים', 'גביע הטוטו', 'גביע ליליאן'];

export async function buildClubHubPayload(): Promise<ClubHubPayload> {
  const [honorsRows, hof, pages] = await Promise.all([
    prisma.clubHonor.findMany({ orderBy: [{ year: 'asc' }] }),
    prisma.hallOfFameEntry.findMany({ where: { isPublished: true }, orderBy: { rank: 'asc' } }),
    prisma.clubPage.findMany({
      where: { isPublished: true },
      orderBy: { displayOrder: 'asc' },
      select: { slug: true, title: true, category: true, heroImageUrl: true },
    }),
  ]);

  const byComp = new Map<string, ClubHonorGroup>();
  for (const h of honorsRows) {
    if (!byComp.has(h.competitionHe)) {
      byComp.set(h.competitionHe, { competitionHe: h.competitionHe, winners: [], runnersUp: [] });
    }
    const g = byComp.get(h.competitionHe)!;
    (h.place === 'WINNER' ? g.winners : g.runnersUp).push(h.seasonLabel);
  }
  const honors = Array.from(byComp.values()).sort((a, b) => {
    const ai = COMP_ORDER.indexOf(a.competitionHe);
    const bi = COMP_ORDER.indexOf(b.competitionHe);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const totalTitles = honorsRows.filter((h) => h.place === 'WINNER').length;

  const hallOfFame: HallOfFameItem[] = hof.map((e) => ({
    id: e.id,
    playerId: e.playerId,
    nameHe: e.nameHe,
    role: e.role as HallOfFameItem['role'],
    years: e.years,
    blurbHe: e.blurbHe,
    statLineHe: e.statLineHe,
    photoUrl: e.photoUrl,
  }));

  return { honors, totalTitles, hallOfFame, pages: pages as ClubPageSummary[] };
}

export async function getClubPage(slug: string): Promise<ClubPageDetail | null> {
  const pg = await prisma.clubPage.findUnique({ where: { slug: decodeURIComponent(slug) } });
  if (!pg || !pg.isPublished) return null;
  return {
    slug: pg.slug,
    title: pg.title,
    category: pg.category as ClubPageDetail['category'],
    heroImageUrl: pg.heroImageUrl,
    bodyHe: pg.bodyHe,
  };
}

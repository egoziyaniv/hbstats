import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const BS_AF = 563;

/**
 * /club/season — a stable address for Beer Sheva's current "תמונת עונה".
 * Team rows are per season, so a link straight to /teams/<id>/season would point at last
 * season the moment a new one starts. This resolves the team row of the latest season in
 * which Beer Sheva has played a competitive game.
 */
export default async function ClubSeasonRedirect() {
  const team = await prisma.team.findFirst({
    where: {
      apiFootballId: BS_AF,
      OR: [
        { homeGames: { some: { status: 'COMPLETED' } } },
        { awayGames: { some: { status: 'COMPLETED' } } },
      ],
    },
    orderBy: { season: { year: 'desc' } },
    select: { id: true },
  });
  if (!team) notFound();
  redirect(`/teams/${team.id}/season`);
}

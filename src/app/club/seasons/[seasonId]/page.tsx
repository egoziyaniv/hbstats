import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SeasonDossierClient from '@/components/SeasonDossierClient';
import { buildSeasonDossier } from '@/lib/season-dossier';

export const dynamic = 'force-dynamic';
const getDossier = cache((seasonId: string) => buildSeasonDossier(seasonId));

type Props = { params: Promise<{ seasonId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seasonId } = await params;
  const dossier = await getDossier(seasonId);
  if (!dossier) return { title: 'תיק עונה לא נמצא' };
  const title = `${dossier.team.nameHe} ${dossier.season.name} — תיק עונה`;
  return {
    title,
    description: `הסיפור, הסגל, הטבלה, המשחקים והמקורות של ${dossier.team.nameHe} בעונת ${dossier.season.name}.`,
  };
}

export default async function SeasonDossierPage({ params }: Props) {
  const { seasonId } = await params;
  const dossier = await getDossier(seasonId);
  if (!dossier) notFound();
  return <SeasonDossierClient dossier={dossier} />;
}

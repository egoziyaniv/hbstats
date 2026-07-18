import { prisma } from '@/lib/prisma';

export const STAT_DATA_VERSION_KEY = 'stat_data_version';

export async function getDataVersion(): Promise<string> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STAT_DATA_VERSION_KEY } });
  return typeof row?.valueJson === 'string' ? row.valueJson : '0';
}

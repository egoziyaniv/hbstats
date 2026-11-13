/** Nightly: drop chat questions older than a year (the retention the spec promises). */
import prisma from '@/lib/prisma';
import { pruneChatLog } from '@/lib/chat-sql/log';

pruneChatLog()
  .then((n) => console.log(`pruned ${n} chat questions older than a year`))
  .finally(() => prisma.$disconnect());

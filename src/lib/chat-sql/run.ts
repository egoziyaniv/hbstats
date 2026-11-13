// Runs a guard-approved chat query: read-only transaction, 5-second timeout, 200-row cap. When
// CHAT_DATABASE_URL is set it connects as the hbs_chat role, which can read schema `chat` only;
// until then the chat's SQL tool is offered to admins only (see isChatSqlPublic).
import { PrismaClient } from '@prisma/client';
import { checkSql, ensureParser } from './guard';

export const MAX_ROWS = 200;
const TIMEOUT = '5s';

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
  ms: number;
}

let client: PrismaClient | null = null;
function chatClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: process.env.CHAT_DATABASE_URL || process.env.DATABASE_URL } } });
  }
  return client;
}

/** The read-only role exists and the SQL tool may serve every signed-in user. */
export const isChatSqlPublic = () => Boolean(process.env.CHAT_DATABASE_URL);

function plain(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().replace('T00:00:00.000Z', '');
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber(); // Prisma Decimal
  }
  return value;
}

export async function runChatQuery(sql: string, params: unknown[] = []): Promise<QueryResult | { error: string }> {
  await ensureParser();
  const trimmed = sql.trim().replace(/;\s*$/, '');
  const check = checkSql(trimmed, { allowParams: params.length > 0 });
  if ('reason' in check) return { error: `השאילתה נדחתה: ${check.reason}` };
  const t0 = Date.now();
  try {
    const raw = await chatClient().$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${TIMEOUT}'`);
      return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM (${trimmed}) AS q LIMIT ${MAX_ROWS + 1}`, ...params);
    }, { timeout: 15_000, maxWait: 5_000 });
    const rows = raw.slice(0, MAX_ROWS).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])));
    return { columns: rows[0] ? Object.keys(rows[0]) : [], rows, truncated: raw.length > MAX_ROWS, ms: Date.now() - t0 };
  } catch (e) {
    // Only the database's own message — never stack traces or connection details.
    const meta = (e as { meta?: { message?: string } }).meta;
    const msg = meta?.message || (e as Error).message || 'query failed';
    return { error: msg.split('\n').filter((l) => !/prisma|invocation|at /i.test(l)).join(' ').slice(0, 300) || 'query failed' };
  }
}

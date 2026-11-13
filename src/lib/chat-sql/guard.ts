// Every query the chat model writes passes through here before it runs. It is parsed with the real
// PostgreSQL 16 parser and accepted only if it is ONE read-only SELECT over the `chat` schema
// (or its own CTEs), calling only allow-listed functions. The read-only transaction, statement
// timeout and the hbs_chat role (see run.ts) are further layers, not a reason to loosen this.
import { loadModule, parseSync } from 'libpg-query';

export type GuardResult = { ok: true } | { ok: false; reason: string };

const FUNCTIONS = new Set([
  // aggregates
  'count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg', 'bool_and', 'bool_or', 'every',
  'percentile_cont', 'percentile_disc', 'mode', 'stddev', 'stddev_pop', 'stddev_samp', 'variance', 'json_agg', 'jsonb_agg',
  // window
  'row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist', 'ntile', 'lag', 'lead', 'first_value', 'last_value', 'nth_value',
  // numbers
  'round', 'floor', 'ceil', 'ceiling', 'abs', 'sign', 'mod', 'power', 'sqrt', 'trunc', 'div',
  // text
  'lower', 'upper', 'length', 'char_length', 'concat', 'concat_ws', 'substring', 'substr', 'trim', 'btrim', 'ltrim', 'rtrim',
  'split_part', 'replace', 'position', 'strpos', 'left', 'right', 'lpad', 'rpad', 'initcap', 'format', 'translate', 'reverse',
  // dates
  'extract', 'date_part', 'date_trunc', 'to_char', 'age', 'make_date', 'make_interval', 'to_date', 'now', 'justify_days',
  // sets
  'generate_series', 'unnest', 'array_length', 'cardinality', 'coalesce', 'greatest', 'least', 'nullif',
]);
const CASTS_DENIED = /^(reg|pg_|oid$|xid|cid|tid)/;

let loaded: Promise<void> | null = null;
export function ensureParser(): Promise<void> {
  if (!loaded) loaded = loadModule().then(() => undefined);
  return loaded;
}

type Node = Record<string, unknown>;

function lastName(parts: unknown): { name: string; schema: string | null } {
  const names = (Array.isArray(parts) ? parts : []).map((p) => String((p as { String?: { sval?: string } })?.String?.sval ?? ''));
  return { name: (names[names.length - 1] || '').toLowerCase(), schema: names.length > 1 ? names[0].toLowerCase() : null };
}

/** Walks every node; returns the first violation. */
function walk(node: unknown, ctes: Set<string>, allowParams: boolean): string | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = walk(n, ctes, allowParams);
      if (r) return r;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  for (const [key, value] of Object.entries(node as Node)) {
    switch (key) {
      case 'InsertStmt': case 'UpdateStmt': case 'DeleteStmt': case 'MergeStmt':
        return 'only reading is allowed';
      case 'RangeVar': {
        const rv = value as { schemaname?: string; catalogname?: string; relname?: string };
        if (rv.catalogname) return `table ${rv.relname} is not allowed`;
        if (rv.schemaname === 'chat') break;
        if (!rv.schemaname && rv.relname && ctes.has(rv.relname.toLowerCase())) break;
        return `only chat.* tables may be queried (got ${rv.schemaname ? `${rv.schemaname}.` : ''}${rv.relname})`;
      }
      case 'FuncCall': {
        const { name, schema } = lastName((value as { funcname?: unknown }).funcname);
        if (schema && schema !== 'pg_catalog') return `function ${schema}.${name} is not allowed`;
        if (!FUNCTIONS.has(name)) return `function ${name} is not allowed`;
        break;
      }
      case 'TypeCast': {
        const { name } = lastName((value as { typeName?: { names?: unknown } }).typeName?.names);
        if (CASTS_DENIED.test(name)) return `cast to ${name} is not allowed`;
        break;
      }
      case 'ParamRef':
        if (!allowParams) return 'parameters are not allowed';
        break;
      case 'intoClause': return 'SELECT INTO is not allowed';
      case 'lockingClause': return 'locking clauses are not allowed';
      case 'RangeTableSample': case 'XmlExpr': case 'XmlSerialize': case 'CurrentOfExpr':
        return `${key} is not allowed`;
      default:
        break;
    }
    const r = walk(value, ctes, allowParams);
    if (r) return r;
  }
  return null;
}

function collectCtes(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) { node.forEach((n) => collectCtes(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Node)) {
    if (key === 'CommonTableExpr') {
      const name = (value as { ctename?: string }).ctename;
      if (name) out.add(name.toLowerCase());
    }
    collectCtes(value, out);
  }
}

/** Synchronous check; call ensureParser() once before. */
export function checkSql(sql: string, { allowParams = false } = {}): GuardResult {
  let parsed: { stmts?: Array<{ stmt?: Node }> };
  try {
    parsed = parseSync(sql);
  } catch (e) {
    return { ok: false, reason: `syntax error: ${(e as Error).message}` };
  }
  const stmts = parsed.stmts ?? [];
  if (stmts.length !== 1) return { ok: false, reason: 'exactly one statement is allowed' };
  const stmt = stmts[0].stmt ?? {};
  if (!('SelectStmt' in stmt)) return { ok: false, reason: 'only SELECT queries are allowed' };
  const ctes = new Set<string>();
  collectCtes(stmt, ctes);
  const violation = walk(stmt, ctes, allowParams);
  return violation ? { ok: false, reason: violation } : { ok: true };
}

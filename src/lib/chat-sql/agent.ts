// The site chat on the OpenAI Responses API: gpt-6-luna answers with the six lookup tools plus
// runQuery (read-only SQL over schema `chat`). When luna can't get a working query — two failed
// queries, too many rounds, or no answer — the same question is re-run once on gpt-6.1-sol.
import OpenAI from 'openai';
import type { FunctionTool, ResponseInput } from 'openai/resources/responses/responses';
import { buildSystemPrompt, type ChatMessage } from '@/lib/ai-providers';
import { executeTool, toolDefinitions } from '@/lib/ai-tools';
import { buildDataInstructions, describeTable } from './dictionary';
import { runChatQuery } from './run';

export const LUNA = 'gpt-6-luna';
export const SOL = 'gpt-6.1-sol';
const MAX_ROUNDS = 8;
const MAX_TOOL_OUTPUT = 20_000; // characters handed back to the model per call

/** USD per 1M tokens (input, output). */
export const PRICES: Record<string, [number, number]> = { [LUNA]: [0.1, 0.5], [SOL]: [2, 10] };

export interface QueryLog { sql: string; rows?: number; ms?: number; error?: string }
export interface AgentResult {
  reply: string;
  model: string;
  outcome: 'ok' | 'escalated' | 'failed';
  queries: QueryLog[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const SQL_TOOLS: FunctionTool[] = [
  {
    type: 'function', strict: false, name: 'runQuery',
    description: 'Run ONE read-only PostgreSQL SELECT over the chat.* tables and get the rows back (max 200). Use for any statistical, historical or counting question.',
    parameters: { type: 'object', properties: { sql: { type: 'string', description: 'A single SELECT (CTEs allowed) over chat.* tables only' } }, required: ['sql'] },
  },
  {
    type: 'function', strict: false, name: 'describeTable',
    description: 'Columns and meaning of one chat.* table.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'e.g. chat.player_appearances' } }, required: ['name'] },
  },
];

const LOOKUP_TOOLS: FunctionTool[] = toolDefinitions.map((t) => ({
  type: 'function', strict: false, name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown>,
}));

const cost = (model: string, input: number, output: number) => {
  const [i, o] = PRICES[model] ?? [0, 0];
  return (input * i + output * o) / 1_000_000;
};

interface RunOutcome { reply: string | null; queries: QueryLog[]; sqlErrors: number; input: number; output: number }

async function runModel(client: OpenAI, model: string, messages: ChatMessage[], sqlAllowed: boolean): Promise<RunOutcome> {
  const instructions = sqlAllowed ? buildDataInstructions(buildSystemPrompt()) : buildSystemPrompt();
  const tools = sqlAllowed ? [...SQL_TOOLS, ...LOOKUP_TOOLS] : LOOKUP_TOOLS;
  const out: RunOutcome = { reply: null, queries: [], sqlErrors: 0, input: 0, output: 0 };
  let input: ResponseInput = messages.map((m) => ({ role: m.role, content: m.content }));
  let previous: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const res = await client.responses.create({
      model, instructions, input, tools,
      reasoning: { effort: model === SOL ? 'medium' : 'low' },
      max_output_tokens: 8000,
      ...(previous ? { previous_response_id: previous } : {}),
    });
    out.input += res.usage?.input_tokens ?? 0;
    out.output += res.usage?.output_tokens ?? 0;
    previous = res.id;

    const calls = res.output.filter((item): item is Extract<typeof item, { type: 'function_call' }> => item.type === 'function_call');
    if (!calls.length) {
      out.reply = res.output_text?.trim() || null;
      return out;
    }
    const results: ResponseInput = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.arguments || '{}'); } catch { /* handled as a tool error below */ }
      let result: unknown;
      if (call.name === 'runQuery') {
        if (!sqlAllowed) result = { error: 'not available' };
        else {
          const sql = String(args.sql ?? '');
          const r = await runChatQuery(sql);
          if ('error' in r) { out.sqlErrors += 1; out.queries.push({ sql, error: r.error }); }
          else out.queries.push({ sql, rows: r.rows.length, ms: r.ms });
          result = r;
        }
      } else if (call.name === 'describeTable') {
        result = describeTable(String(args.name ?? ''));
      } else {
        result = await executeTool(call.name, args).catch((e) => ({ error: String((e as Error).message || e) }));
      }
      results.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result).slice(0, MAX_TOOL_OUTPUT) });
    }
    input = results;
    if (out.sqlErrors >= 2 && model !== SOL) return out; // escalate rather than keep guessing
  }
  return out;
}

export async function answerWithData(apiKey: string, messages: ChatMessage[], { sqlAllowed }: { sqlAllowed: boolean }): Promise<AgentResult> {
  const client = new OpenAI({ apiKey });
  const first = await runModel(client, LUNA, messages, sqlAllowed);
  const firstCost = cost(LUNA, first.input, first.output);
  if (first.reply && first.sqlErrors < 2) {
    return { reply: first.reply, model: LUNA, outcome: 'ok', queries: first.queries, inputTokens: first.input, outputTokens: first.output, costUsd: firstCost };
  }
  const second = await runModel(client, SOL, messages, sqlAllowed);
  return {
    reply: second.reply || 'לא הצלחתי למצוא תשובה בנתונים. נסה לנסח את השאלה אחרת.',
    model: SOL,
    outcome: second.reply ? 'escalated' : 'failed',
    queries: [...first.queries, ...second.queries],
    inputTokens: first.input + second.input,
    outputTokens: first.output + second.output,
    costUsd: firstCost + cost(SOL, second.input, second.output),
  };
}

/**
 * Shared types for the streaming agent runtime.
 *
 * Both providers (Claude, Gemini) implement the same `AgentRunner` shape so
 * the API route doesn't care which one is in use.
 */

export type ChartSpec = {
  type: "bar" | "line" | "pie" | "doughnut" | "scatter";
  title: string;
  /** Category labels (x-axis values for bar/line/scatter, slice labels for pie). */
  labels: (string | number)[];
  datasets: { label: string; data: number[] }[];
};

/**
 * Discriminated union of every event the agent can emit during a run.
 * The /api/agent SSE endpoint serializes these one-per-message.
 */
export type AgentEvent =
  | { type: "start"; model: string }
  | { type: "text"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output?: unknown; error?: string }
  | { type: "chart"; spec: ChartSpec }
  | { type: "usage"; inputTokens: number; outputTokens: number; estCostUsd: number }
  | { type: "done"; reason: "stop" | "max_turns" | "error" }
  | { type: "error"; message: string };

/** A single conversational turn for follow-up support. Lossy: tool calls are dropped. */
export type ConvTurn = { role: "user" | "assistant"; text: string };

export type ToolContext = {
  workspaceId: string;
  schemaName: string;
  /** Charts collected during the run, populated by the render_chart tool. */
  charts: ChartSpec[];
};

export type Tool = {
  name: string;
  description: string;
  /** JSON schema for the tool's input. */
  input_schema: Record<string, unknown>;
  execute: (input: any, ctx: ToolContext) => Promise<unknown>;
};

export type AgentRunOptions = {
  question: string;
  model: string; // e.g. "claude:claude-sonnet-4-6" or "gemini:gemini-2.5-flash"
  workspace: { id: string; schemaName: string };
  /** Prior conversation turns (text-only — tool calls from earlier turns are dropped). */
  history?: ConvTurn[];
  /** Optional extra text appended to the system prompt (e.g. metric glossary). */
  extraSystem?: string;
  signal?: AbortSignal;
};

/**
 * Rough USD cost estimate per million tokens. Lookup by model id substring.
 * Used for the in-trace cost summary — accuracy is approximate.
 */
const PRICING: { match: RegExp; inputPerM: number; outputPerM: number }[] = [
  { match: /opus/i, inputPerM: 15, outputPerM: 75 },
  { match: /sonnet/i, inputPerM: 3, outputPerM: 15 },
  { match: /haiku/i, inputPerM: 0.8, outputPerM: 4 },
  { match: /gemini.*2\.5.*pro/i, inputPerM: 1.25, outputPerM: 5 },
  { match: /gemini.*2\.5.*flash/i, inputPerM: 0.075, outputPerM: 0.3 },
  { match: /gemini/i, inputPerM: 0.1, outputPerM: 0.4 },
];

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING.find((p) => p.match.test(model));
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.inputPerM + (outputTokens / 1_000_000) * p.outputPerM;
}

/** Build the full system prompt for a run, optionally with appended context. */
export function buildSystemPrompt(extra?: string): string {
  if (!extra || !extra.trim()) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\n## Metric glossary (terms defined by this user)\n${extra.trim()}`;
}

export type AgentRunner = (opts: AgentRunOptions) => AsyncIterable<AgentEvent>;

/** System prompt shared by all providers. */
export const SYSTEM_PROMPT = `You are Digital Data Analyst, a senior analyst helping a user investigate questions about data they've uploaded.

Workflow:
1. ALWAYS call \`list_tables\` first to discover what data is available.
2. Sketch a brief plan (2-4 lines) of how you'll answer the question. Output the plan as a Markdown blockquote starting with "**Plan:**" before any tool calls.
3. Use \`query_sql\` to run SELECT queries that investigate the question. The user's workspace schema is set as search_path so reference tables by their unqualified name. This is real Postgres — use \`date_trunc\`, \`EXTRACT\`, \`COALESCE\`, window functions, etc. SQLite-only functions are NOT available.
4. **If a query errors**, read the error message carefully and call \`query_sql\` again with a corrected version. Common fixes: cast types explicitly, quote reserved column names, check the schema returned by list_tables. Don't give up after one error.
5. Use \`render_chart\` to register visualizations supporting your findings (bar / line / pie / doughnut / scatter).
6. If you discover something durable about the user's data that would help future analyses (e.g. "the 'orders' table uses cents not dollars", "the 'region' column has typos"), call \`save_note\` once near the end.
7. After investigating, write a final markdown report with:
   - A bold one-line headline answering the question
   - 2-4 hypotheses you considered, each with a verdict (✅ confirmed / ❌ refuted / ⚠️ inconclusive) and the evidence
   - A short analysis section citing concrete numbers from your queries

Be concise. Do not narrate "I'll now run a query" — just call the tool. Stop after the final report.`;

"use client";

import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { chatStream, type LocalModelId } from "./webllm-client";
import type { StepId, SubTabId } from "./WorkflowSteps";

export type CoachAction =
  | { kind: "go_to_step"; step: StepId }
  | { kind: "go_to_subtab"; subtab: SubTabId }
  | { kind: "load_demo" }
  | { kind: "open_palette" }
  | { kind: "open_import" }
  | { kind: "ask_ai"; question: string }
  | { kind: "new_conversation" };

export type CoachActionCard = { label: string; action: CoachAction };

export type CoachMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; actions?: CoachActionCard[] };

const COACH_SYSTEM_PROMPT = `You are the Digital Coworker Coach — a friendly, concise in-app guide for data analysts.

The app is organized around the seven steps of the analyst workflow:

1. **Define** — Frame the business question, capture stakeholders, define what success looks like. (Tools coming soon.)
2. **Acquire** — Upload CSV / Excel, or import from URL / Google Sheets / external Postgres. Datasets browser shows what's loaded.
3. **Clean** — Dedupe rows, parse dates, drop columns, add derived columns.
4. **EDA** — Auto-profile schema, ask questions in plain English (Ask AI), slice with pivots, browse 28 tool cards.
5. **Model** — Regression, clustering, time-series decomposition, A/B significance. (Tools coming soon.)
6. **Communicate** — Build dashboards, save analyses with public share links.
7. **Deploy** — Schedule re-runs of saved analyses, configure SQL-based alerts.

Workbench (always available): SQL editor, metric Glossary.

Style:
- Be concise. Two or three sentences per turn at most.
- When suggesting where to go, call the \`suggest_action\` tool so the user gets a one-click button.
- Don't list every option — pick the single most useful next step.
- For "what next?" questions, recommend the next workflow step the user hasn't completed.
- Prefer guiding through the deterministic features (cleaners, profilers, dashboards) over running the AI agent for every question.
- If the user is stuck, suggest loading the demo dataset so they can practice on real data.`;

const SUGGEST_ACTION_TOOL = {
  name: "suggest_action",
  description:
    "Suggest one navigation action the user can click to move forward. Call this when guiding the user. At most one suggestion per turn unless the user explicitly asks for multiple options.",
  input_schema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Button label for the user to click (max 60 chars).",
      },
      kind: {
        type: "string",
        enum: [
          "go_to_step",
          "go_to_subtab",
          "load_demo",
          "open_palette",
          "open_import",
          "ask_ai",
          "new_conversation",
        ],
        description: "What kind of action to take.",
      },
      step: {
        type: "string",
        enum: [
          "define",
          "acquire",
          "clean",
          "eda",
          "model",
          "communicate",
          "deploy",
          "workbench",
        ],
        description: "Required when kind=go_to_step.",
      },
      subtab: {
        type: "string",
        description:
          "Required when kind=go_to_subtab. Examples: ask, schema, pivot, tools, clean, dashboard, saved, sql, glossary, deploy-schedules, deploy-alerts.",
      },
      question: {
        type: "string",
        description: "Required when kind=ask_ai. The natural-language question to pre-fill.",
      },
    },
    required: ["label", "kind"],
  },
};

const VALID_STEPS = new Set([
  "define",
  "acquire",
  "clean",
  "eda",
  "model",
  "communicate",
  "deploy",
  "workbench",
]);
const VALID_SUBTABS = new Set([
  "define-brief",
  "define-questions",
  "define-metrics",
  "data",
  "clean",
  "ask",
  "schema",
  "eda-summary",
  "eda-correlations",
  "eda-insights",
  "pivot",
  "tools",
  "model-regression",
  "model-clustering",
  "model-timeseries",
  "model-abtest",
  "dashboard",
  "saved",
  "deploy-schedules",
  "deploy-alerts",
  "sql",
  "glossary",
]);

function parseAction(input: unknown): CoachActionCard | null {
  if (!input || typeof input !== "object") return null;
  const i = input as any;
  const label = typeof i.label === "string" ? i.label.slice(0, 60) : null;
  const kind = i.kind;
  if (!label || typeof kind !== "string") return null;
  switch (kind) {
    case "go_to_step":
      if (!VALID_STEPS.has(i.step)) return null;
      return { label, action: { kind: "go_to_step", step: i.step as StepId } };
    case "go_to_subtab":
      if (!VALID_SUBTABS.has(i.subtab)) return null;
      return { label, action: { kind: "go_to_subtab", subtab: i.subtab as SubTabId } };
    case "load_demo":
      return { label, action: { kind: "load_demo" } };
    case "open_palette":
      return { label, action: { kind: "open_palette" } };
    case "open_import":
      return { label, action: { kind: "open_import" } };
    case "new_conversation":
      return { label, action: { kind: "new_conversation" } };
    case "ask_ai":
      if (typeof i.question !== "string" || !i.question.trim()) return null;
      return { label, action: { kind: "ask_ai", question: i.question.trim() } };
  }
  return null;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export type CoachContext = {
  currentStepLabel: string;
  datasetCount: number;
  hasSavedAnalyses: boolean;
};

export type CoachStreamChunk =
  | { kind: "text"; delta: string }
  | { kind: "actions"; cards: CoachActionCard[] }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * Stream a coach response. The coach is intentionally lighter than the
 * data-analysis agent: one tool only (`suggest_action`), no SQL, no charts,
 * shorter system prompt for faster small-model inference.
 */
export async function* runCoach(opts: {
  modelId: LocalModelId;
  history: CoachMessage[];
  userMessage: string;
  ctx: CoachContext;
  signal?: AbortSignal;
}): AsyncIterable<CoachStreamChunk> {
  const ctxLine = `Current state — step: ${opts.ctx.currentStepLabel}, datasets loaded: ${opts.ctx.datasetCount}, saved analyses: ${opts.ctx.hasSavedAnalyses ? "yes" : "no"}.`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: `${COACH_SYSTEM_PROMPT}\n\n${ctxLine}` },
  ];
  for (const m of opts.history) {
    messages.push({ role: m.role, content: m.text });
  }
  messages.push({ role: "user", content: opts.userMessage });

  const cards: CoachActionCard[] = [];

  try {
    for await (const chunk of chatStream({
      messages,
      tools: [SUGGEST_ACTION_TOOL],
      signal: opts.signal,
    })) {
      if (chunk.kind === "text") {
        yield { kind: "text", delta: chunk.delta };
      } else if (chunk.kind === "tool_call" && chunk.name === "suggest_action") {
        const card = parseAction(safeParse(chunk.arguments));
        if (card) cards.push(card);
      }
    }
    if (cards.length > 0) yield { kind: "actions", cards };
    yield { kind: "done" };
  } catch (e: any) {
    yield { kind: "error", message: e?.message ?? String(e) };
  }
}

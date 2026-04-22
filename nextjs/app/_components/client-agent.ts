"use client";

import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type { AgentEvent, ChartSpec, ConvTurn } from "@/lib/agent/types";
import { SYSTEM_PROMPT } from "@/lib/agent/types";
import { chatStream, ensureEngine, type LocalModelId } from "./webllm-client";

const MAX_TURNS = 8;

/** JSON schemas + descriptions for the four agent tools — mirrors lib/agent/tools.ts */
const TOOL_DEFS = [
  {
    name: "list_tables",
    description:
      "List every table in the user's workspace, including columns, types, and row counts. Call this first.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "query_sql",
    description:
      "Run a single SQL SELECT statement against the workspace. Returns up to 200 rows. Postgres dialect.",
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "A single SELECT statement." } },
      required: ["sql"],
    },
  },
  {
    name: "render_chart",
    description:
      "Register a chart for the final report. Pick from bar / line / pie / doughnut / scatter.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["bar", "line", "pie", "doughnut", "scatter"] },
        title: { type: "string" },
        labels: { type: "array", items: {} },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              data: { type: "array", items: { type: "number" } },
            },
            required: ["label", "data"],
          },
        },
      },
      required: ["type", "title", "labels", "datasets"],
    },
  },
  {
    name: "save_note",
    description:
      "Persist a short note about something durable you learned about the user's data. Use sparingly.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string" } },
      required: ["note"],
    },
  },
];

async function executeServerTool(
  name: string,
  input: unknown,
  signal?: AbortSignal
): Promise<{ output?: unknown; error?: string }> {
  try {
    const res = await fetch("/api/agent/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, input }),
      signal,
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
    if (data.ok === false) return { error: data.error ?? "Tool failed" };
    return { output: data.output };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Some small models emit unquoted/loose JSON. Try a couple of repair passes.
    try {
      return JSON.parse(s.replace(/,\s*[}\]]/g, "$&".replace(",", "")));
    } catch {
      return {};
    }
  }
}

export type ClientAgentOptions = {
  question: string;
  modelId: LocalModelId;
  history?: ConvTurn[];
  extraSystem?: string;
  signal?: AbortSignal;
};

/**
 * Run the agent loop entirely in the browser. Uses WebLLM for inference and
 * server REST endpoints for tool execution. Yields the same AgentEvent
 * stream as the server agent so the existing UI components don't change.
 */
export async function* runClientAgent(
  opts: ClientAgentOptions
): AsyncIterable<AgentEvent> {
  yield { type: "start", model: `local:${opts.modelId}` };

  const systemPrompt = opts.extraSystem
    ? `${SYSTEM_PROMPT}\n\n${opts.extraSystem.trim()}`
    : SYSTEM_PROMPT;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  for (const turn of opts.history ?? []) {
    messages.push({ role: turn.role, content: turn.text });
  }
  messages.push({ role: "user", content: opts.question });

  let totalInputApprox = systemPrompt.length / 4;
  let totalOutputApprox = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (opts.signal?.aborted) {
      yield { type: "done", reason: "error" };
      return;
    }

    let assistantText = "";
    const toolCalls: { id: string; name: string; arguments: string }[] = [];
    let finishReason = "stop";

    try {
      for await (const chunk of chatStream({
        messages,
        tools: TOOL_DEFS,
        signal: opts.signal,
      })) {
        if (chunk.kind === "text") {
          assistantText += chunk.delta;
          totalOutputApprox += chunk.delta.length / 4;
          yield { type: "text", delta: chunk.delta };
        } else if (chunk.kind === "tool_call") {
          toolCalls.push({ id: chunk.id, name: chunk.name, arguments: chunk.arguments });
        } else if (chunk.kind === "done") {
          finishReason = chunk.finishReason;
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      yield { type: "error", message: msg };
      yield { type: "done", reason: "error" };
      return;
    }

    // Append assistant turn to message history (with any tool calls).
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantText || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments || "{}" },
        })),
      } as any);
    } else if (assistantText) {
      messages.push({ role: "assistant", content: assistantText });
    }

    // No tool calls → final answer reached.
    if (toolCalls.length === 0) {
      yield {
        type: "usage",
        inputTokens: Math.round(totalInputApprox),
        outputTokens: Math.round(totalOutputApprox),
        estCostUsd: 0,
      };
      yield { type: "done", reason: finishReason === "length" ? "max_turns" : "stop" };
      return;
    }

    // Execute every tool the model requested this turn.
    for (const tc of toolCalls) {
      const input = safeParse(tc.arguments);
      yield { type: "tool_use", id: tc.id, name: tc.name, input };

      let output: unknown;
      let error: string | undefined;

      if (tc.name === "render_chart") {
        // Charts stay in the browser — emit and acknowledge to the model.
        const spec = input as ChartSpec;
        if (spec && spec.type && spec.title) {
          yield { type: "chart", spec };
          output = { ok: true, registered: spec.title };
        } else {
          error = "Chart spec missing type/title";
        }
      } else {
        const result = await executeServerTool(tc.name, input, opts.signal);
        output = result.output;
        error = result.error;
      }

      yield {
        type: "tool_result",
        id: tc.id,
        name: tc.name,
        ...(error ? { error } : { output }),
      };

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: error ? JSON.stringify({ error }) : JSON.stringify(output ?? {}),
      } as any);

      const resultStr = error ?? JSON.stringify(output ?? {});
      totalInputApprox += resultStr.length / 4;
    }
  }

  yield {
    type: "usage",
    inputTokens: Math.round(totalInputApprox),
    outputTokens: Math.round(totalOutputApprox),
    estCostUsd: 0,
  };
  yield { type: "done", reason: "max_turns" };
}

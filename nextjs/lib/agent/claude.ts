/**
 * Claude (Anthropic) streaming agent runner.
 *
 * Loops messages.stream() → execute tool_use blocks → feed results back,
 * yielding AgentEvents along the way. Caps at MAX_TURNS to prevent runaway
 * conversations.
 */
import Anthropic from "@anthropic-ai/sdk";
import { tools as agentTools, findTool } from "./tools";
import {
  buildSystemPrompt,
  estimateCost,
  type AgentEvent,
  type AgentRunOptions,
  type ChartSpec,
  type ToolContext,
} from "./types";

const MAX_TURNS = 12;
const MAX_TOKENS = 4096;

export async function* runClaude(opts: AgentRunOptions): AsyncIterable<AgentEvent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { type: "error", message: "ANTHROPIC_API_KEY is not set on the server" };
    yield { type: "done", reason: "error" };
    return;
  }

  const client = new Anthropic({ apiKey });
  const modelId = opts.model.replace(/^claude:/, "");
  yield { type: "start", model: modelId };

  const ctx: ToolContext = {
    workspaceId: opts.workspace.id,
    schemaName: opts.workspace.schemaName,
    charts: [],
  };

  const claudeTools = agentTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as any,
  }));

  const systemPrompt = buildSystemPrompt(opts.extraSystem);

  // Anthropic's MessageParam list — seeded with prior conversation history
  // (text-only) plus the new user question.
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of opts.history ?? []) {
    messages.push({ role: turn.role, content: turn.text });
  }
  messages.push({ role: "user", content: opts.question });

  let totalInput = 0;
  let totalOutput = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: claudeTools,
        messages,
      },
      { signal: opts.signal }
    );

    // Live stream text deltas to the client. Tool input deltas are also
    // streamed but we don't surface them — we just wait for finalMessage()
    // to get the assembled tool_use block with the parsed input.
    try {
      for await (const ev of stream) {
        if (
          ev.type === "content_block_delta" &&
          ev.delta.type === "text_delta"
        ) {
          yield { type: "text", delta: ev.delta.text };
        }
      }
    } catch (e: any) {
      yield { type: "error", message: e?.message ?? String(e) };
      yield { type: "done", reason: "error" };
      return;
    }

    const finalMessage = await stream.finalMessage();
    totalInput += finalMessage.usage?.input_tokens ?? 0;
    totalOutput += finalMessage.usage?.output_tokens ?? 0;

    // Push the assistant turn into history exactly as the SDK assembled it.
    messages.push({ role: "assistant", content: finalMessage.content });

    const toolUses = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0 || finalMessage.stop_reason === "end_turn") {
      yield {
        type: "usage",
        inputTokens: totalInput,
        outputTokens: totalOutput,
        estCostUsd: estimateCost(modelId, totalInput, totalOutput),
      };
      yield { type: "done", reason: "stop" };
      return;
    }

    // Execute each tool the model asked for, then feed results back as a
    // single user message of tool_result blocks (Anthropic's expected shape).
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      yield { type: "tool_use", id: tu.id, name: tu.name, input: tu.input };
      const tool = findTool(tu.name);
      if (!tool) {
        const err = `Unknown tool: ${tu.name}`;
        yield { type: "tool_result", id: tu.id, name: tu.name, error: err };
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: err,
          is_error: true,
        });
        continue;
      }
      try {
        const out = await tool.execute(tu.input as any, ctx);
        yield { type: "tool_result", id: tu.id, name: tu.name, output: out };
        if (tu.name === "render_chart") {
          yield { type: "chart", spec: tu.input as ChartSpec };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      } catch (e: any) {
        const err = e?.message ?? String(e);
        yield { type: "tool_result", id: tu.id, name: tu.name, error: err };
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: err,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  yield {
    type: "usage",
    inputTokens: totalInput,
    outputTokens: totalOutput,
    estCostUsd: estimateCost(modelId, totalInput, totalOutput),
  };
  yield { type: "done", reason: "max_turns" };
}

import { runClaude } from "./claude";
import { runGemini } from "./gemini";
import type { AgentEvent, AgentRunOptions, AgentRunner } from "./types";

export type { AgentEvent, AgentRunOptions, AgentRunner } from "./types";

/**
 * Resolve the right provider runner from the model id.
 * Model ids are namespaced: `claude:claude-sonnet-4-6`, `gemini:gemini-2.5-flash`.
 */
export function pickRunner(model: string): AgentRunner | null {
  if (model.startsWith("claude:")) return runClaude;
  if (model.startsWith("gemini:")) return runGemini;
  return null;
}

export async function* runAgent(opts: AgentRunOptions): AsyncIterable<AgentEvent> {
  const runner = pickRunner(opts.model);
  if (!runner) {
    yield { type: "error", message: `Unknown model: ${opts.model}` };
    yield { type: "done", reason: "error" };
    return;
  }
  yield* runner(opts);
}

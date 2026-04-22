"use client";

/**
 * Thin singleton wrapper around @mlc-ai/web-llm.
 *
 * The engine is heavy (megabytes of WASM + GBs of model weights) so we keep
 * one instance per page. Loading is lazy — the first call to `ensure()`
 * downloads the chosen model and pins it in IndexedDB; subsequent visits
 * reuse the cached weights.
 */

import type { ChatCompletionMessageParam, MLCEngine } from "@mlc-ai/web-llm";

export type LocalModelId =
  | "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC"
  | "Hermes-3-Llama-3.1-8B-q4f16_1-MLC"
  | "Hermes-3-Llama-3.1-8B-q4f32_1-MLC";

export type LocalModelInfo = {
  id: LocalModelId;
  label: string;
  approxSizeGb: number;
  notes: string;
};

// Only models that support OpenAI-style function calling are listed here —
// both the data-analysis agent and the Coach rely on tool calls. WebLLM's
// "tools" parameter throws on any model not in this whitelist, so anything
// smaller than ~7B without function-calling fine-tuning is unusable.
export const LOCAL_MODELS: LocalModelInfo[] = [
  {
    id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC",
    label: "Hermes 2 Pro (Mistral 7B) — smallest",
    approxSizeGb: 4.0,
    notes: "Smallest function-calling-capable model. Fastest first download.",
  },
  {
    id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
    label: "Hermes 3 (Llama 3.1 8B, 16-bit) — balanced",
    approxSizeGb: 4.7,
    notes: "Better quality than Mistral 7B, slightly larger.",
  },
  {
    id: "Hermes-3-Llama-3.1-8B-q4f32_1-MLC",
    label: "Hermes 3 (Llama 3.1 8B, 32-bit) — best",
    approxSizeGb: 5.7,
    notes: "Highest quality, biggest download.",
  },
];

export const DEFAULT_LOCAL_MODEL: LocalModelId =
  "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC";

export type LoadProgress = {
  /** 0..1 if known, otherwise undefined for indeterminate stages. */
  progress?: number;
  /** Human-readable message from web-llm's loader. */
  text: string;
};

let engine: MLCEngine | null = null;
let loaded: LocalModelId | null = null;
let loadingPromise: Promise<MLCEngine> | null = null;

/**
 * Returns true if the browser has WebGPU. WebLLM requires it for inference.
 * Safari < 18 and most mobile browsers will return false.
 */
export function hasWebGPU(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as any).gpu);
}

/** True if the engine is loaded and ready for the given model id. */
export function isLoaded(modelId: LocalModelId): boolean {
  return engine != null && loaded === modelId;
}

/** Currently-loaded local model id, or null if none. */
export function loadedModel(): LocalModelId | null {
  return loaded;
}

/**
 * Ensure the WebLLM engine is loaded with `modelId`. Subsequent calls with
 * the same model id return the same engine instance instantly.
 */
export async function ensureEngine(
  modelId: LocalModelId,
  onProgress?: (p: LoadProgress) => void
): Promise<MLCEngine> {
  if (engine && loaded === modelId) return engine;
  if (loadingPromise) return loadingPromise;

  if (!hasWebGPU()) {
    throw new Error(
      "WebGPU not available in this browser. Try Chrome / Edge / Brave on desktop, or Safari 18+."
    );
  }

  loadingPromise = (async () => {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    const newEngine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        onProgress?.({
          progress: typeof report.progress === "number" ? report.progress : undefined,
          text: report.text || "Loading…",
        });
      },
    });
    engine = newEngine;
    loaded = modelId;
    loadingPromise = null;
    return newEngine;
  })();

  return loadingPromise;
}

export type ChatRequest = {
  messages: ChatCompletionMessageParam[];
  tools?: { name: string; description: string; input_schema: Record<string, unknown> }[];
  signal?: AbortSignal;
  /** Hard cap on output tokens. Without one, a model that loops streams forever. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.7 for slightly more conversational variety. */
  temperature?: number;
};

export type ChatChunk =
  | { kind: "text"; delta: string }
  | { kind: "tool_call"; id: string; name: string; arguments: string }
  | { kind: "done"; finishReason: string };

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Stream a chat completion from the loaded engine. Translates web-llm's
 * OpenAI-shaped streaming chunks into a small enum the agent loop consumes.
 *
 * Aborts: when `signal` fires we call `engine.interruptGenerate()` so the
 * underlying GPU work actually stops — without this the for-await keeps
 * waiting for chunks that never come.
 */
export async function* chatStream(req: ChatRequest): AsyncIterable<ChatChunk> {
  if (!engine) throw new Error("Engine not loaded — call ensureEngine() first");

  const tools = req.tools?.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as any,
    },
  }));

  // Wire abort signal to WebLLM's interrupt so the stream actually unblocks.
  let abortHandler: (() => void) | null = null;
  if (req.signal && engine) {
    const eng = engine;
    abortHandler = () => {
      try {
        (eng as any).interruptGenerate?.();
      } catch {}
    };
    req.signal.addEventListener("abort", abortHandler, { once: true });
  }

  const stream = await engine.chat.completions.create({
    messages: req.messages,
    stream: true,
    tools,
    tool_choice: tools && tools.length > 0 ? "auto" : undefined,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: req.temperature ?? 0.7,
  } as any);

  // Tool calls arrive in deltas; accumulate by index.
  const toolBuffers: Record<number, { id: string; name: string; arguments: string }> = {};
  let finishReason = "stop";

  for await (const chunk of stream as any) {
    if (req.signal?.aborted) break;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content.length > 0) {
      yield { kind: "text", delta: delta.content };
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx: number = tc.index ?? 0;
        if (!toolBuffers[idx]) {
          toolBuffers[idx] = {
            id: tc.id ?? `call_${idx}`,
            name: tc.function?.name ?? "",
            arguments: "",
          };
        }
        if (tc.function?.name) toolBuffers[idx].name = tc.function.name;
        if (typeof tc.function?.arguments === "string") {
          toolBuffers[idx].arguments += tc.function.arguments;
        }
        if (tc.id) toolBuffers[idx].id = tc.id;
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  for (const idx of Object.keys(toolBuffers)) {
    const tc = toolBuffers[Number(idx)];
    if (tc.name) yield { kind: "tool_call", id: tc.id, name: tc.name, arguments: tc.arguments };
  }
  if (abortHandler && req.signal) {
    req.signal.removeEventListener("abort", abortHandler);
  }
  yield { kind: "done", finishReason };
}

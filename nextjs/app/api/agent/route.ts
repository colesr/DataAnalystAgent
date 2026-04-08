import { eq } from "drizzle-orm";
import { runAgent } from "@/lib/agent";
import { db } from "@/lib/db";
import { agentRuns, glossaryEntries } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { ConvTurn } from "@/lib/agent/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const RATE_LIMIT_PER_MIN = parseInt(process.env.AGENT_RATE_LIMIT_PER_MIN ?? "10", 10);

async function loadGlossary(workspaceId: string): Promise<string> {
  const rows = await db
    .select({ name: glossaryEntries.name, definition: glossaryEntries.definition })
    .from(glossaryEntries)
    .where(eq(glossaryEntries.workspaceId, workspaceId));
  if (rows.length === 0) return "";
  return rows.map((r) => `- **${r.name}**: ${r.definition}`).join("\n");
}

/**
 * POST /api/agent
 * Body: { question: string, model: string, history?: ConvTurn[] }
 *
 * Streams server-sent events of the agent's progress. Each line is a
 * standard SSE `data:` payload containing one JSON-encoded AgentEvent.
 */
export async function POST(req: Request) {
  // Rate limit by IP — protects against runaway cost.
  const ip = clientIp(req);
  const rl = rateLimit(`agent:${ip}`, { limit: RATE_LIMIT_PER_MIN, windowSec: 60 });
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: `Rate limit: try again in ${rl.retryAfterSec}s` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSec),
        },
      }
    );
  }

  let body: { question?: string; model?: string; history?: ConvTurn[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const question = (body.question ?? "").trim();
  const model = (body.model ?? "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  if (!question) return new Response("Missing question", { status: 400 });
  if (!model) return new Response("Missing model", { status: 400 });

  const ws = await getOrCreateWorkspace();
  const extraSystem = await loadGlossary(ws.id);
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {}
      };

      const abort = new AbortController();
      req.signal.addEventListener("abort", () => abort.abort());

      let lastInputTokens = 0;
      let lastOutputTokens = 0;
      let lastError: string | undefined;

      try {
        for await (const ev of runAgent({
          question,
          model,
          workspace: { id: ws.id, schemaName: ws.schemaName },
          history,
          extraSystem,
          signal: abort.signal,
        })) {
          send(ev);
          if (ev.type === "usage") {
            lastInputTokens = ev.inputTokens;
            lastOutputTokens = ev.outputTokens;
          } else if (ev.type === "error") {
            lastError = ev.message;
          } else if (ev.type === "done") {
            break;
          }
        }
      } catch (e: any) {
        lastError = e?.message ?? String(e);
        send({ type: "error", message: lastError });
        send({ type: "done", reason: "error" });
      } finally {
        // Persist telemetry — best effort.
        db.insert(agentRuns)
          .values({
            workspaceId: ws.id,
            model,
            question,
            inputTokens: lastInputTokens,
            outputTokens: lastOutputTokens,
            durationMs: Date.now() - startedAt,
            error: lastError,
          })
          .catch((e) => console.error("[agent] telemetry write failed:", e));
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

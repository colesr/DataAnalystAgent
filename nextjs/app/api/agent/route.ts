import { eq } from "drizzle-orm";
import { runAgent } from "@/lib/agent";
import { db } from "@/lib/db";
import { glossaryEntries } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

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
 * Body: { question: string, model: string }
 *
 * Streams server-sent events of the agent's progress. Each line is a
 * standard SSE `data:` payload containing one JSON-encoded AgentEvent.
 */
export async function POST(req: Request) {
  let body: { question?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const question = (body.question ?? "").trim();
  const model = (body.model ?? "").trim();
  if (!question) return new Response("Missing question", { status: 400 });
  if (!model) return new Response("Missing model", { status: 400 });

  const ws = await getOrCreateWorkspace();
  const extraSystem = await loadGlossary(ws.id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // controller already closed — agent finished and client disconnected
        }
      };

      const abort = new AbortController();
      // Cancel the agent if the client disconnects.
      req.signal.addEventListener("abort", () => abort.abort());

      try {
        for await (const ev of runAgent({
          question,
          model,
          workspace: { id: ws.id, schemaName: ws.schemaName },
          extraSystem,
          signal: abort.signal,
        })) {
          send(ev);
          if (ev.type === "done") break;
        }
      } catch (e: any) {
        send({ type: "error", message: e?.message ?? String(e) });
        send({ type: "done", reason: "error" });
      } finally {
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
      // Disable buffering on proxies (Railway/Cloudflare/etc.)
      "X-Accel-Buffering": "no",
    },
  });
}

import { findTool } from "@/lib/agent/tools";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_LIMIT_PER_MIN = parseInt(process.env.AGENT_TOOL_RATE_LIMIT_PER_MIN ?? "120", 10);

const ALLOWED = new Set(["list_tables", "query_sql", "save_note"]);

/**
 * POST /api/agent/tool
 * Body: { name: string, input: unknown }
 *
 * Executes a single agent tool server-side and returns its result. Used by
 * the in-browser WebLLM agent loop, which can't reach the database directly.
 *
 * `render_chart` is intentionally excluded — chart specs stay in the browser.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`agent-tool:${ip}`, { limit: RATE_LIMIT_PER_MIN, windowSec: 60 });
  if (!rl.ok) {
    return Response.json(
      { error: `Rate limit: try again in ${rl.retryAfterSec}s` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let body: { name?: string; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name || !ALLOWED.has(name)) {
    return Response.json({ error: `Tool not available: ${name}` }, { status: 400 });
  }

  const tool = findTool(name);
  if (!tool) return Response.json({ error: `Unknown tool: ${name}` }, { status: 400 });

  const ws = await getOrCreateWorkspace();

  try {
    const output = await tool.execute(body.input as any, {
      workspaceId: ws.id,
      schemaName: ws.schemaName,
      charts: [], // unused — chart collection happens in the browser
    });
    return Response.json({ ok: true, output });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 });
  }
}

import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { glossaryEntries, workspaceMemory } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * GET /api/agent/context
 *
 * Returns the per-workspace context the agent should prepend to its system
 * prompt: the metric glossary and the most recent ~5 saved notes. The
 * server agent route fetches these inline; the in-browser agent calls this
 * endpoint once at the start of a run.
 */
export async function GET() {
  const ws = await getOrCreateWorkspace();

  const [glossary, memory] = await Promise.all([
    db
      .select({ name: glossaryEntries.name, definition: glossaryEntries.definition })
      .from(glossaryEntries)
      .where(eq(glossaryEntries.workspaceId, ws.id)),
    db
      .select({ note: workspaceMemory.note })
      .from(workspaceMemory)
      .where(eq(workspaceMemory.workspaceId, ws.id))
      .orderBy(desc(workspaceMemory.createdAt))
      .limit(5),
  ]);

  const parts: string[] = [];
  if (memory.length > 0) {
    parts.push(
      `## Notes from previous runs in this workspace\n${memory
        .reverse()
        .map((r) => `- ${r.note}`)
        .join("\n")}`
    );
  }
  if (glossary.length > 0) {
    parts.push(
      `## Metric glossary\n${glossary.map((g) => `- **${g.name}**: ${g.definition}`).join("\n")}`
    );
  }

  return Response.json({ extraSystem: parts.join("\n\n") });
}

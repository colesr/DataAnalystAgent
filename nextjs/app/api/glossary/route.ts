import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { glossaryEntries } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  const ws = await getOrCreateWorkspace();
  const rows = await db
    .select({ name: glossaryEntries.name, definition: glossaryEntries.definition })
    .from(glossaryEntries)
    .where(eq(glossaryEntries.workspaceId, ws.id));
  return NextResponse.json({ entries: rows });
}

/**
 * PUT replaces the whole glossary for the workspace. Body: { entries: [{name, definition}] }
 * Simpler than per-entry CRUD given how small glossaries are in practice.
 */
export async function PUT(req: Request) {
  let body: { entries?: { name?: string; definition?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const incoming = (body.entries ?? [])
    .map((e) => ({
      name: (e.name ?? "").trim(),
      definition: (e.definition ?? "").trim(),
    }))
    .filter((e) => e.name && e.definition);

  const ws = await getOrCreateWorkspace();

  await db.transaction(async (tx) => {
    await tx.delete(glossaryEntries).where(eq(glossaryEntries.workspaceId, ws.id));
    if (incoming.length > 0) {
      await tx.insert(glossaryEntries).values(
        incoming.map((e) => ({
          workspaceId: ws.id,
          name: e.name,
          definition: e.definition,
        }))
      );
    }
  });

  return NextResponse.json({ ok: true, count: incoming.length });
}

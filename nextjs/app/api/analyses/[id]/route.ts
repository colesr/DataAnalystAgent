import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { analyses } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();
  const [row] = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.id, id), eq(analyses.workspaceId, ws.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();
  await db
    .delete(analyses)
    .where(and(eq(analyses.id, id), eq(analyses.workspaceId, ws.id)));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { analyses } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/** POST → generate (or rotate) a share token. DELETE → revoke. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();

  const [existing] = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(and(eq(analyses.id, id), eq(analyses.workspaceId, ws.id)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 16 random bytes → 22-char base64url token
  const token = randomBytes(16).toString("base64url");
  await db.update(analyses).set({ shareToken: token }).where(eq(analyses.id, id));
  return NextResponse.json({ shareToken: token });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();
  await db
    .update(analyses)
    .set({ shareToken: null })
    .where(and(eq(analyses.id, id), eq(analyses.workspaceId, ws.id)));
  return NextResponse.json({ ok: true });
}

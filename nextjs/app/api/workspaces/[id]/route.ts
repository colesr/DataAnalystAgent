import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/schema";
import { ForbiddenError, requireWorkspaceMember } from "@/lib/workspace";
import { qualifiedTable } from "@/lib/sql-ident";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspaceMember(id, "owner");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  await db.update(workspaces).set({ name }).where(eq(workspaces.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspaceMember(id, "owner");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Look up the schema so we can drop it after the row is gone.
  const [ws] = await db
    .select({ schemaName: workspaces.schemaName })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Drop the data + the metadata. Cascades take care of members, datasets,
  // analyses, etc. The physical schema (tables) has to be dropped manually.
  await db.delete(workspaces).where(eq(workspaces.id, id));
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${ws.schemaName}" CASCADE`));

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardTiles } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();
  const [row] = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, ws.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tiles = await db
    .select()
    .from(dashboardTiles)
    .where(eq(dashboardTiles.dashboardId, id))
    .orderBy(asc(dashboardTiles.position));

  return NextResponse.json({ ...row, tiles });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();
  await db
    .delete(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, ws.id)));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  await db
    .update(dashboards)
    .set({ name: body.name.trim(), updatedAt: new Date() })
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, ws.id)));
  return NextResponse.json({ ok: true });
}

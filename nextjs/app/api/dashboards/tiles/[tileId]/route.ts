import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardTiles } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tileId: string }> }
) {
  const { tileId } = await params;
  const ws = await getOrCreateWorkspace();

  // Join to confirm the tile belongs to a dashboard the workspace owns.
  const [tile] = await db
    .select({ id: dashboardTiles.id })
    .from(dashboardTiles)
    .innerJoin(dashboards, eq(dashboardTiles.dashboardId, dashboards.id))
    .where(and(eq(dashboardTiles.id, tileId), eq(dashboards.workspaceId, ws.id)))
    .limit(1);
  if (!tile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(dashboardTiles).where(eq(dashboardTiles.id, tileId));
  return NextResponse.json({ ok: true });
}

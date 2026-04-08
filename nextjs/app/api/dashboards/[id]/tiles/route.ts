import { NextResponse } from "next/server";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardTiles } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

const VALID_TYPES = new Set([
  "bar",
  "line",
  "pie",
  "doughnut",
  "scatter",
  "big_number",
  "table",
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();

  // Verify dashboard ownership before adding a tile.
  const [d] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, ws.id)))
    .limit(1);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { title?: string; sql?: string; chartType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  const sqlText = (body.sql ?? "").trim();
  const chartType = (body.chartType ?? "").trim();
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
  if (!sqlText) return NextResponse.json({ error: "Missing sql" }, { status: 400 });
  if (!VALID_TYPES.has(chartType)) {
    return NextResponse.json(
      { error: `chartType must be one of: ${[...VALID_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  // Append at the end of the existing tile order.
  const [{ value: maxPos }] = await db
    .select({ value: max(dashboardTiles.position) })
    .from(dashboardTiles)
    .where(eq(dashboardTiles.dashboardId, id));

  const [row] = await db
    .insert(dashboardTiles)
    .values({
      dashboardId: id,
      title,
      sql: sqlText,
      chartType,
      position: (maxPos ?? -1) + 1,
    })
    .returning();
  return NextResponse.json(row);
}

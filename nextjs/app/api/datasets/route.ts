import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  const ws = await getOrCreateWorkspace();
  const rows = await db
    .select({
      id: datasets.id,
      name: datasets.name,
      tableName: datasets.tableName,
      sourceFile: datasets.sourceFile,
      columns: datasets.columns,
      rowCount: datasets.rowCount,
      createdAt: datasets.createdAt,
    })
    .from(datasets)
    .where(eq(datasets.workspaceId, ws.id))
    .orderBy(desc(datasets.createdAt));

  return NextResponse.json({ workspaceId: ws.id, datasets: rows });
}

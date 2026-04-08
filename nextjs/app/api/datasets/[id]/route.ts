import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable } from "@/lib/sql-ident";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();

  const [row] = await db
    .select({ tableName: datasets.tableName })
    .from(datasets)
    .where(and(eq(datasets.id, id), eq(datasets.workspaceId, ws.id)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Drop the underlying table first; if that fails we still have the
  // metadata pointing at it so the user can retry.
  await db.execute(
    sql.raw(`DROP TABLE IF EXISTS ${qualifiedTable(ws.schemaName, row.tableName)}`)
  );

  await db
    .delete(datasets)
    .where(and(eq(datasets.id, id), eq(datasets.workspaceId, ws.id)));

  return NextResponse.json({ ok: true });
}

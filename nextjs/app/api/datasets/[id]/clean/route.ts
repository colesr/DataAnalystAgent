import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable, quoteIdent, sanitizeIdent } from "@/lib/sql-ident";

export const runtime = "nodejs";

type CleanOp =
  | { op: "dedupe" }
  | { op: "parse_dates"; column: string }
  | { op: "add_column"; name: string; expression: string; type?: string }
  | { op: "drop" };

/**
 * POST /api/datasets/[id]/clean
 *
 * Mutates the underlying physical table and updates the dataset metadata
 * to match. All ops run inside the workspace's schema with search_path locked.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();

  const [meta] = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.id, id), eq(datasets.workspaceId, ws.id)))
    .limit(1);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: CleanOp;
  try {
    body = (await req.json()) as CleanOp;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fq = qualifiedTable(ws.schemaName, meta.tableName);

  try {
    if (body.op === "drop") {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS ${fq}`));
      await db.delete(datasets).where(eq(datasets.id, id));
      return NextResponse.json({ ok: true });
    }

    if (body.op === "dedupe") {
      const before = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${fq}`));
      const beforeCount = Number((before as any)[0]?.n ?? 0);
      // Postgres: keep one ctid per duplicate row.
      await db.execute(
        sql.raw(`
          DELETE FROM ${fq} a USING ${fq} b
          WHERE a.ctid < b.ctid
            AND a IS NOT DISTINCT FROM b
        `)
      );
      const after = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${fq}`));
      const afterCount = Number((after as any)[0]?.n ?? 0);
      await db
        .update(datasets)
        .set({ rowCount: afterCount })
        .where(eq(datasets.id, id));
      return NextResponse.json({ ok: true, removed: beforeCount - afterCount });
    }

    if (body.op === "parse_dates") {
      const colName = sanitizeIdent(body.column);
      if (!meta.columns.find((c) => c.name === colName)) {
        return NextResponse.json({ error: `Unknown column: ${body.column}` }, { status: 400 });
      }
      // USING NULLIF + ::timestamptz so unparseable rows become NULL instead of erroring.
      await db.execute(
        sql.raw(`
          ALTER TABLE ${fq}
          ALTER COLUMN ${quoteIdent(colName)} TYPE timestamptz
          USING NULLIF(${quoteIdent(colName)}::text, '')::timestamptz
        `)
      );
      const newCols = meta.columns.map((c) =>
        c.name === colName ? { ...c, type: "timestamptz" } : c
      );
      await db.update(datasets).set({ columns: newCols }).where(eq(datasets.id, id));
      return NextResponse.json({ ok: true, column: colName });
    }

    if (body.op === "add_column") {
      const colName = sanitizeIdent(body.name);
      if (!colName) return NextResponse.json({ error: "Invalid column name" }, { status: 400 });
      if (meta.columns.find((c) => c.name === colName)) {
        return NextResponse.json({ error: "Column already exists" }, { status: 400 });
      }
      const type = body.type ?? "double precision";
      const expr = body.expression?.trim();
      if (!expr) return NextResponse.json({ error: "Missing expression" }, { status: 400 });
      // ALTER + UPDATE inside one transaction so a failed expression rolls back.
      await db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`ALTER TABLE ${fq} ADD COLUMN ${quoteIdent(colName)} ${type}`)
        );
        await tx.execute(
          sql.raw(`UPDATE ${fq} SET ${quoteIdent(colName)} = (${expr})`)
        );
      });
      const newCols = [...meta.columns, { name: colName, type }];
      await db.update(datasets).set({ columns: newCols }).where(eq(datasets.id, id));
      return NextResponse.json({ ok: true, column: colName, type });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}

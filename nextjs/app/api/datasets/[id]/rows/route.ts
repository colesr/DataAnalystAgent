import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable, quoteIdent, sanitizeIdent } from "@/lib/sql-ident";

export const runtime = "nodejs";

const MAX_PAGE_SIZE = 500;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  );
  const sortColRaw = url.searchParams.get("sort") ?? "";
  const dirRaw = (url.searchParams.get("dir") ?? "asc").toLowerCase();
  const dir = dirRaw === "desc" ? "DESC" : "ASC";
  const filter = (url.searchParams.get("q") ?? "").trim();

  const ws = await getOrCreateWorkspace();

  const [meta] = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.id, id), eq(datasets.workspaceId, ws.id)))
    .limit(1);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const colNames = meta.columns.map((c) => c.name);
  const validSortCol = colNames.includes(sanitizeIdent(sortColRaw))
    ? sanitizeIdent(sortColRaw)
    : null;

  const fq = qualifiedTable(ws.schemaName, meta.tableName);
  const offset = page * pageSize;

  // Build optional case-insensitive LIKE across all text-castable columns.
  // Filter is parameterized; column list comes from sanitized metadata.
  let whereClause = sql``;
  if (filter) {
    const pattern = `%${filter.toLowerCase()}%`;
    const conds = colNames.map(
      (c) => sql`LOWER(CAST(${sql.raw(quoteIdent(c))} AS text)) LIKE ${pattern}`
    );
    whereClause = sql` WHERE ${sql.join(conds, sql` OR `)}`;
  }

  // Total (filtered) row count
  const countStmt = sql`${sql.raw(`SELECT COUNT(*)::int AS n FROM ${fq}`)}${whereClause}`;
  const countRes = await db.execute(countStmt);
  const total = (countRes as any)[0]?.n ?? 0;

  // Page of rows
  const orderClause = validSortCol
    ? sql.raw(` ORDER BY ${quoteIdent(validSortCol)} ${dir} NULLS LAST`)
    : sql``;
  const pageStmt = sql`${sql.raw(`SELECT * FROM ${fq}`)}${whereClause}${orderClause}${sql.raw(
    ` LIMIT ${pageSize} OFFSET ${offset}`
  )}`;
  const rowsRes = (await db.execute(pageStmt)) as any[];

  return NextResponse.json({
    columns: meta.columns,
    rows: rowsRes,
    total,
    page,
    pageSize,
  });
}

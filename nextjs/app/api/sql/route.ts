import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { queryHistory } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

const MAX_ROWS = 1000;

export async function POST(req: Request) {
  let body: { sql?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const userSql = (body.sql ?? "").trim();
  const source = body.source ?? "editor";
  if (!userSql) {
    return NextResponse.json({ error: "Empty SQL" }, { status: 400 });
  }

  const ws = await getOrCreateWorkspace();
  const startedAt = Date.now();

  try {
    // Run inside a transaction so SET LOCAL is scoped — no risk of search_path
    // leaking back into the pooled connection for other workspaces.
    const result = (await db.transaction(async (tx) => {
      // schemaName is generated from a UUID hex with a fixed prefix, so it's
      // safe to interpolate. The user SQL itself is sent as raw text (the user
      // is querying their *own* schema which is the whole point of this API).
      await tx.execute(
        sql.raw(`SET LOCAL search_path TO "${ws.schemaName}", public`)
      );
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = '15s'`));
      return await tx.execute(sql.raw(userSql));
    })) as any;

    const durationMs = Date.now() - startedAt;

    // postgres-js returns rows as an array of plain objects. Extract a stable
    // column order from the first row, fall back to [] if there are no rows.
    const rowsAll: Record<string, unknown>[] = Array.isArray(result) ? result : [];
    const columns = rowsAll[0] ? Object.keys(rowsAll[0]) : [];
    const truncated = rowsAll.length > MAX_ROWS;
    const rows = truncated ? rowsAll.slice(0, MAX_ROWS) : rowsAll;

    // Fire-and-forget: log to query history (don't fail the request if this errors).
    db.insert(queryHistory)
      .values({
        workspaceId: ws.id,
        sql: userSql,
        source,
        rowCount: rowsAll.length,
        durationMs,
      })
      .catch((e) => console.error("[sql] history log failed:", e));

    return NextResponse.json({
      columns,
      rows,
      rowCount: rowsAll.length,
      truncated,
      durationMs,
    });
  } catch (e: any) {
    const durationMs = Date.now() - startedAt;
    const message = e?.message ?? "Query failed";

    db.insert(queryHistory)
      .values({
        workspaceId: ws.id,
        sql: userSql,
        source,
        durationMs,
        error: message,
      })
      .catch(() => {});

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

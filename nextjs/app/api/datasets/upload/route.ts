import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { parseSpreadsheet, baseNameForTable } from "@/lib/csv";
import { quoteIdent, qualifiedTable, uniqueTableName, sanitizeIdent } from "@/lib/sql-ident";

export const runtime = "nodejs";

// Cap upload size at 25 MB to keep memory + parsing predictable.
const MAX_BYTES = 25 * 1024 * 1024;

// Chunk INSERTs so we never exceed Postgres's 65535-parameter limit.
const ROW_CHUNK = 500;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseSpreadsheet(buf, file.name);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "File has no data rows" }, { status: 400 });
    }

    const ws = await getOrCreateWorkspace();

    // Pick a unique table name within this workspace.
    const existingNames = await db
      .select({ tableName: datasets.tableName })
      .from(datasets)
      .where(eq(datasets.workspaceId, ws.id));
    const tableName = uniqueTableName(
      baseNameForTable(file.name),
      existingNames.map((r) => r.tableName)
    );

    const fq = qualifiedTable(ws.schemaName, tableName);

    // Build CREATE TABLE statement. Identifiers are pre-sanitized so this
    // is safe to interpolate; values are still parameterized below.
    const colDefs = parsed.columns
      .map((c) => `${quoteIdent(c.name)} ${c.type}`)
      .join(", ");
    await db.execute(sql.raw(`CREATE TABLE ${fq} (${colDefs})`));

    // Bulk insert in chunks
    const colList = parsed.columns.map((c) => quoteIdent(c.name)).join(", ");
    for (let start = 0; start < parsed.rows.length; start += ROW_CHUNK) {
      const chunk = parsed.rows.slice(start, start + ROW_CHUNK);
      const valueClauses = chunk.map(
        (row) => sql`(${sql.join(row.map((v) => sql`${v}`), sql`, `)})`
      );
      const stmt = sql`${sql.raw(`INSERT INTO ${fq} (${colList}) VALUES `)}${sql.join(
        valueClauses,
        sql`, `
      )}`;
      await db.execute(stmt);
    }

    // Insert dataset metadata
    const desiredName = sanitizeIdent(baseNameForTable(file.name)) || tableName;
    const [meta] = await db
      .insert(datasets)
      .values({
        workspaceId: ws.id,
        name: desiredName,
        tableName,
        sourceFile: file.name,
        columns: parsed.columns.map((c) => ({ name: c.name, type: c.type })),
        rowCount: parsed.rows.length,
      })
      .returning();

    return NextResponse.json({
      id: meta.id,
      name: meta.name,
      tableName: meta.tableName,
      columns: meta.columns,
      rowCount: meta.rowCount,
    });
  } catch (e: any) {
    console.error("[upload] failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}

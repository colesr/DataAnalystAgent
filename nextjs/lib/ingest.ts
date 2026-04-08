/**
 * Shared dataset ingestion: takes a parsed spreadsheet (or any
 * ParsedDataset shape), creates the physical Postgres table inside the
 * workspace's schema, bulk-inserts every row, and writes the metadata row.
 *
 * Used by:
 *   - /api/datasets/upload         (multipart file)
 *   - /api/datasets/import-url     (fetched URL)
 *   - /api/datasets/import-gsheet  (Google Sheet → CSV export URL)
 *   - /api/datasets/import-postgres (SELECT against an external Postgres)
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { datasets } from "./schema";
import type { ParsedDataset } from "./csv";
import type { Workspace } from "./workspace";
import {
  qualifiedTable,
  quoteIdent,
  sanitizeIdent,
  uniqueTableName,
} from "./sql-ident";

/** Chunked INSERTs so we never exceed Postgres's 65535-parameter limit. */
const ROW_CHUNK = 500;

export type IngestResult = {
  id: string;
  name: string;
  tableName: string;
  rowCount: number;
};

export async function ingestParsed(opts: {
  ws: Workspace;
  parsed: ParsedDataset;
  desiredName: string;
  sourceFile?: string | null;
}): Promise<IngestResult> {
  const { ws, parsed } = opts;

  // Pick a unique table name within this workspace.
  const existingNames = await db
    .select({ tableName: datasets.tableName })
    .from(datasets)
    .where(eq(datasets.workspaceId, ws.id));
  const tableName = uniqueTableName(
    opts.desiredName,
    existingNames.map((r) => r.tableName)
  );

  const fq = qualifiedTable(ws.schemaName, tableName);

  // CREATE TABLE — column definitions are pre-sanitized so this is safe to interpolate.
  const colDefs = parsed.columns
    .map((c) => `${quoteIdent(c.name)} ${c.type}`)
    .join(", ");
  await db.execute(sql.raw(`CREATE TABLE ${fq} (${colDefs})`));

  // Bulk insert in chunks. Values are parameterized via drizzle's sql template.
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

  // Metadata row pointing at the physical table.
  const sanitizedName = sanitizeIdent(opts.desiredName) || tableName;
  const [meta] = await db
    .insert(datasets)
    .values({
      workspaceId: ws.id,
      name: sanitizedName,
      tableName,
      sourceFile: opts.sourceFile ?? null,
      columns: parsed.columns.map((c) => ({ name: c.name, type: c.type })),
      rowCount: parsed.rows.length,
    })
    .returning();

  return {
    id: meta.id,
    name: meta.name,
    tableName: meta.tableName,
    rowCount: meta.rowCount,
  };
}

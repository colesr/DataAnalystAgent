import { NextResponse } from "next/server";
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable, quoteIdent } from "@/lib/sql-ident";

export const runtime = "nodejs";
export const maxDuration = 30;

const NUMERIC_PATTERN = /int|numeric|decimal|double|real|float/i;
const SAMPLE_LIMIT = 5000; // cap rows used for correlation

/**
 * GET /api/eda/correlations?datasetId=...
 *
 * Pulls up to SAMPLE_LIMIT numeric rows from the dataset and computes the
 * Pearson correlation matrix in-process. Returns columns + a square matrix
 * of values in [-1, 1].
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const datasetId = url.searchParams.get("datasetId");
  if (!datasetId) {
    return NextResponse.json({ error: "Missing datasetId" }, { status: 400 });
  }

  const ws = await getOrCreateWorkspace();
  const [ds] = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.id, datasetId), eq(datasets.workspaceId, ws.id)));
  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const numericCols = ds.columns
    .filter((c) => NUMERIC_PATTERN.test(c.type))
    .map((c) => c.name)
    .slice(0, 20); // cap at 20 cols (matrix of 400 cells)

  if (numericCols.length < 2) {
    return NextResponse.json({
      columns: numericCols,
      matrix: [],
      sampleSize: 0,
      note: "Need at least 2 numeric columns to compute correlations.",
    });
  }

  const fq = qualifiedTable(ws.schemaName, ds.tableName);
  const colsSql = numericCols
    .map((c) => `${quoteIdent(c)}::float8 AS ${quoteIdent(c)}`)
    .join(", ");
  const querySql = `SELECT ${colsSql} FROM ${fq} LIMIT ${SAMPLE_LIMIT}`;
  const rows = (await db.execute(sql.raw(querySql))) as any[];

  // Build column arrays of finite numbers only.
  const series: Record<string, number[]> = {};
  for (const c of numericCols) series[c] = [];
  for (const row of rows) {
    for (const c of numericCols) {
      const v = Number(row[c]);
      if (Number.isFinite(v)) series[c].push(v);
      else series[c].push(NaN);
    }
  }

  const matrix: number[][] = [];
  for (const a of numericCols) {
    const row: number[] = [];
    for (const b of numericCols) {
      row.push(pearson(series[a], series[b]));
    }
    matrix.push(row);
  }

  return NextResponse.json({
    columns: numericCols,
    matrix,
    sampleSize: rows.length,
  });
}

/** Pearson correlation, ignoring NaN-aligned pairs. Returns 0 if undefined. */
function pearson(a: number[], b: number[]): number {
  let n = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sumA += x;
      sumB += y;
      n++;
    }
  }
  if (n < 2) return 0;
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const dx = x - meanA;
      const dy = y - meanB;
      num += dx * dy;
      denA += dx * dx;
      denB += dy * dy;
    }
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return 0;
  return num / den;
}

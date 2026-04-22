"use client";

export type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  rowCount: number;
  columns: { name: string; type: string }[];
};

const NUMERIC = /int|numeric|decimal|double|real|float/i;
const TEMPORAL = /date|time/i;

export function numericColumns(d: DatasetMeta): string[] {
  return d.columns.filter((c) => NUMERIC.test(c.type)).map((c) => c.name);
}

export function temporalColumns(d: DatasetMeta): string[] {
  return d.columns.filter((c) => TEMPORAL.test(c.type)).map((c) => c.name);
}

export function categoricalColumns(d: DatasetMeta): string[] {
  return d.columns
    .filter((c) => !NUMERIC.test(c.type) && !TEMPORAL.test(c.type))
    .map((c) => c.name);
}

/** Quote a Postgres identifier — duplicate any embedded double-quotes. */
export function quoteId(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/** Run a SELECT via /api/sql and return the rows. */
export async function runSql(sqlText: string): Promise<Record<string, unknown>[]> {
  const res = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sqlText, source: "model" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.rows ?? [];
}

export function asNumberArray(rows: Record<string, unknown>[], col: string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = Number(r[col]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

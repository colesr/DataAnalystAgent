import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable } from "@/lib/sql-ident";

export const runtime = "nodejs";

const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West"];
const CATEGORIES = ["Electronics", "Apparel", "Home", "Grocery", "Toys"];
const TABLE_NAME = "demo_sales";

/**
 * POST /api/datasets/seed
 * Creates a small `demo_sales` table in the caller's workspace with ~120
 * rows of fake but realistic data, plus the matching metadata row.
 */
export async function POST() {
  const ws = await getOrCreateWorkspace();

  // Don't create the table twice — just return whatever exists.
  const [existing] = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.workspaceId, ws.id), eq(datasets.tableName, TABLE_NAME)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, alreadyExists: true });
  }

  const fq = qualifiedTable(ws.schemaName, TABLE_NAME);

  await db.execute(
    sql.raw(`
      CREATE TABLE ${fq} (
        order_date date,
        region text,
        category text,
        units integer,
        revenue double precision,
        cost double precision
      )
    `)
  );

  // Generate ~120 rows: 30 days × 4 region/category combos.
  // Mildly trended so analyses (forecast, regression, group-by) actually
  // produce interesting output.
  const today = new Date();
  const rows: [string, string, string, number, number, number][] = [];
  for (let day = 0; day < 30; day++) {
    const d = new Date(today);
    d.setDate(d.getDate() - day);
    const dateStr = d.toISOString().slice(0, 10);
    for (let i = 0; i < 4; i++) {
      const region = REGIONS[(day + i) % REGIONS.length];
      const category = CATEGORIES[(day * 2 + i) % CATEGORIES.length];
      const trend = 1 + (29 - day) * 0.01;
      const units = Math.round(20 + Math.random() * 40 * trend);
      const revenue = +(units * (15 + Math.random() * 50)).toFixed(2);
      const cost = +(revenue * (0.45 + Math.random() * 0.25)).toFixed(2);
      rows.push([dateStr, region, category, units, revenue, cost]);
    }
  }

  // Bulk insert in one parameterized statement
  const valueClauses = rows.map(
    (r) => sql`(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]})`
  );
  const stmt = sql`${sql.raw(
    `INSERT INTO ${fq} (order_date, region, category, units, revenue, cost) VALUES `
  )}${sql.join(valueClauses, sql`, `)}`;
  await db.execute(stmt);

  const [meta] = await db
    .insert(datasets)
    .values({
      workspaceId: ws.id,
      name: "demo_sales",
      tableName: TABLE_NAME,
      sourceFile: "(seeded)",
      columns: [
        { name: "order_date", type: "date" },
        { name: "region", type: "text" },
        { name: "category", type: "text" },
        { name: "units", type: "integer" },
        { name: "revenue", type: "double precision" },
        { name: "cost", type: "double precision" },
      ],
      rowCount: rows.length,
    })
    .returning();

  return NextResponse.json({ ok: true, id: meta.id, rowCount: rows.length });
}

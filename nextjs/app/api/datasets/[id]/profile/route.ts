import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable, quoteIdent } from "@/lib/sql-ident";

export const runtime = "nodejs";

type ColumnProfile = {
  name: string;
  type: string;
  total: number;
  nonNull: number;
  distinct: number;
  nullPct: number;
  min?: string | null;
  max?: string | null;
  topValues?: { value: string; count: number }[];
};

function isNumericType(t: string) {
  return /int|numeric|decimal|double|real|float/i.test(t);
}
function isTimeType(t: string) {
  return /time|date/i.test(t);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getOrCreateWorkspace();

  const [meta] = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.id, id), eq(datasets.workspaceId, ws.id)))
    .limit(1);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fq = qualifiedTable(ws.schemaName, meta.tableName);
  const cols = meta.columns;

  const profiles: ColumnProfile[] = await Promise.all(
    cols.map(async (c) => {
      const qcol = quoteIdent(c.name);
      const numericLike = isNumericType(c.type);
      const timeLike = isTimeType(c.type);
      const includeMinMax = numericLike || timeLike;

      // Basic stats
      const statsSql = `
        SELECT
          COUNT(*)::int AS total,
          COUNT(${qcol})::int AS non_null,
          COUNT(DISTINCT ${qcol})::int AS distinct
          ${includeMinMax ? `, MIN(${qcol})::text AS min, MAX(${qcol})::text AS max` : ""}
        FROM ${fq}
      `;
      const statsRows = (await db.execute(sql.raw(statsSql))) as any[];
      const r = statsRows[0] ?? {};

      const total = Number(r.total ?? 0);
      const nonNull = Number(r.non_null ?? 0);
      const distinct = Number(r.distinct ?? 0);

      const profile: ColumnProfile = {
        name: c.name,
        type: c.type,
        total,
        nonNull,
        distinct,
        nullPct: total > 0 ? ((total - nonNull) / total) * 100 : 0,
      };
      if (includeMinMax) {
        profile.min = r.min ?? null;
        profile.max = r.max ?? null;
      }

      // Top 5 values for non-numeric, low-ish cardinality columns.
      if (!numericLike && distinct > 0 && distinct <= 200) {
        const topSql = `
          SELECT ${qcol}::text AS value, COUNT(*)::int AS count
          FROM ${fq}
          WHERE ${qcol} IS NOT NULL
          GROUP BY ${qcol}
          ORDER BY count DESC
          LIMIT 5
        `;
        const topRows = (await db.execute(sql.raw(topSql))) as any[];
        profile.topValues = topRows.map((tr) => ({
          value: String(tr.value ?? ""),
          count: Number(tr.count),
        }));
      }
      return profile;
    })
  );

  // Build a textual schema summary the agent (or copy/paste users) can use.
  const schemaText = `${meta.tableName} (${meta.rowCount.toLocaleString()} rows)\n` +
    cols.map((c) => `  ${c.name} ${c.type}`).join("\n");

  return NextResponse.json({
    name: meta.name,
    tableName: meta.tableName,
    rowCount: meta.rowCount,
    columns: profiles,
    schemaText,
  });
}

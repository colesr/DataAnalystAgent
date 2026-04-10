import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { datasets } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { qualifiedTable, quoteIdent } from "@/lib/sql-ident";

export const runtime = "nodejs";

export type SemanticType =
  | "id"
  | "integer"
  | "decimal"
  | "currency"
  | "percent"
  | "boolean"
  | "date"
  | "datetime"
  | "category"
  | "text"
  | "email"
  | "url"
  | "geo"
  | "json"
  | "unknown";

type ColumnProfile = {
  name: string;
  type: string;
  semantic: SemanticType;
  total: number;
  nonNull: number;
  distinct: number;
  nullPct: number;
  uniquePct: number;
  // numeric stats
  min?: string | null;
  max?: string | null;
  mean?: number | null;
  stddev?: number | null;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  histogram?: { bin: string; count: number }[];
  // string stats
  avgLen?: number | null;
  maxLen?: number | null;
  // categorical
  topValues?: { value: string; count: number }[];
};

function isIntegerType(t: string) {
  return /^(int|bigint|smallint|integer|serial)/i.test(t);
}
function isNumericType(t: string) {
  return /int|numeric|decimal|double|real|float/i.test(t);
}
function isTimeType(t: string) {
  return /time|date/i.test(t);
}
function isBoolType(t: string) {
  return /^bool/i.test(t);
}
function isJsonType(t: string) {
  return /^jsonb?/i.test(t);
}

function inferSemantic(name: string, type: string, distinct: number, total: number, sample?: string | null): SemanticType {
  const n = name.toLowerCase();
  if (isJsonType(type)) return "json";
  if (isBoolType(type)) return "boolean";
  if (isTimeType(type)) return /time/i.test(type) && !/date/i.test(type) ? "datetime" : (type.toLowerCase().includes("timestamp") ? "datetime" : "date");
  if (isNumericType(type)) {
    if (/(_id|^id$|uuid|guid)$/i.test(n) && distinct === total) return "id";
    if (/(price|cost|amount|revenue|sales|usd|eur|gbp|fee|salary|payment|total|balance)/i.test(n)) return "currency";
    if (/(pct|percent|rate|ratio)/i.test(n)) return "percent";
    return isIntegerType(type) ? "integer" : "decimal";
  }
  // text-like
  if (/(email|e_mail)/i.test(n)) return "email";
  if (/(url|link|href|website)/i.test(n)) return "url";
  if (/(lat|lon|lng|country|state|city|zip|postal|region|geo)/i.test(n)) return "geo";
  if (sample && /^https?:\/\//i.test(sample)) return "url";
  if (sample && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sample)) return "email";
  if (distinct > 0 && total > 0 && distinct / total < 0.5 && distinct <= 50) return "category";
  if (distinct === total && total > 0) return "id";
  return "text";
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
      const boolLike = isBoolType(c.type);
      const jsonLike = isJsonType(c.type);
      const includeMinMax = numericLike || timeLike;

      // Basic stats. For numerics also pull mean/stddev/quantiles.
      const numericExtras = numericLike
        ? `,
          AVG(${qcol})::float8 AS mean,
          STDDEV_SAMP(${qcol})::float8 AS stddev,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${qcol})::float8 AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${qcol})::float8 AS median,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${qcol})::float8 AS p75`
        : "";
      // For text-like, pull avg/max length so we can show "looks like a short
      // code vs. paragraph" — useful for schema understanding at a glance.
      const stringExtras = !numericLike && !timeLike && !boolLike && !jsonLike
        ? `,
          AVG(LENGTH(${qcol}::text))::float8 AS avg_len,
          MAX(LENGTH(${qcol}::text))::int AS max_len`
        : "";

      const statsSql = `
        SELECT
          COUNT(*)::int AS total,
          COUNT(${qcol})::int AS non_null,
          COUNT(DISTINCT ${qcol})::int AS distinct
          ${includeMinMax ? `, MIN(${qcol})::text AS min, MAX(${qcol})::text AS max` : ""}
          ${numericExtras}
          ${stringExtras}
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
        semantic: "unknown",
        total,
        nonNull,
        distinct,
        nullPct: total > 0 ? ((total - nonNull) / total) * 100 : 0,
        uniquePct: nonNull > 0 ? (distinct / nonNull) * 100 : 0,
      };
      if (includeMinMax) {
        profile.min = r.min ?? null;
        profile.max = r.max ?? null;
      }
      if (numericLike) {
        profile.mean = r.mean != null ? Number(r.mean) : null;
        profile.stddev = r.stddev != null ? Number(r.stddev) : null;
        profile.p25 = r.p25 != null ? Number(r.p25) : null;
        profile.median = r.median != null ? Number(r.median) : null;
        profile.p75 = r.p75 != null ? Number(r.p75) : null;
      }
      if (stringExtras) {
        profile.avgLen = r.avg_len != null ? Number(r.avg_len) : null;
        profile.maxLen = r.max_len != null ? Number(r.max_len) : null;
      }

      // Numeric histogram (10 equal-width bins) when range is non-degenerate.
      if (numericLike && profile.min != null && profile.max != null) {
        const lo = Number(profile.min);
        const hi = Number(profile.max);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
          const histSql = `
            WITH bounds AS (SELECT ${lo}::float8 AS lo, ${hi}::float8 AS hi)
            SELECT bucket, COUNT(*)::int AS count FROM (
              SELECT WIDTH_BUCKET(${qcol}::float8, lo, hi + (hi - lo) * 1e-9, 10) AS bucket
              FROM ${fq}, bounds
              WHERE ${qcol} IS NOT NULL
            ) t
            WHERE bucket BETWEEN 1 AND 10
            GROUP BY bucket
            ORDER BY bucket
          `;
          const rows = (await db.execute(sql.raw(histSql))) as any[];
          const counts = new Array(10).fill(0);
          for (const row of rows) counts[Number(row.bucket) - 1] = Number(row.count);
          const step = (hi - lo) / 10;
          profile.histogram = counts.map((count, i) => {
            const start = lo + step * i;
            const end = lo + step * (i + 1);
            return { bin: `${formatNum(start)}–${formatNum(end)}`, count };
          });
        }
      }

      // Time histogram — bucket by month if span > 1y, by day otherwise.
      if (timeLike && profile.min && profile.max) {
        const lo = new Date(profile.min);
        const hi = new Date(profile.max);
        if (!isNaN(+lo) && !isNaN(+hi) && +hi > +lo) {
          const days = (+hi - +lo) / 86400000;
          const trunc = days > 365 ? "month" : days > 60 ? "week" : "day";
          const histSql = `
            SELECT date_trunc('${trunc}', ${qcol})::text AS bin, COUNT(*)::int AS count
            FROM ${fq} WHERE ${qcol} IS NOT NULL
            GROUP BY 1 ORDER BY 1
            LIMIT 60
          `;
          const rows = (await db.execute(sql.raw(histSql))) as any[];
          profile.histogram = rows.map((row) => ({
            bin: String(row.bin ?? "").slice(0, 10),
            count: Number(row.count),
          }));
        }
      }

      // Top 5 values for non-numeric, low-ish cardinality columns.
      if ((!numericLike || boolLike) && distinct > 0 && distinct <= 200) {
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

      profile.semantic = inferSemantic(
        c.name,
        c.type,
        distinct,
        total,
        profile.topValues?.[0]?.value ?? null,
      );
      return profile;
    })
  );

  // Build a textual schema summary the agent (or copy/paste users) can use.
  // Now richer: include semantic type and a hint per column.
  const schemaText =
    `${meta.tableName} (${meta.rowCount.toLocaleString()} rows, ${cols.length} columns)\n` +
    profiles
      .map((p) => {
        const hints: string[] = [];
        if (p.uniquePct >= 99 && p.nonNull > 0) hints.push("unique");
        if (p.nullPct > 0) hints.push(`${p.nullPct.toFixed(0)}% null`);
        if (p.mean != null) hints.push(`mean=${formatNum(p.mean)}`);
        if (p.median != null) hints.push(`median=${formatNum(p.median)}`);
        if (p.min != null && p.max != null) hints.push(`range=${p.min}…${p.max}`);
        return `  ${p.name} ${p.type} [${p.semantic}]${hints.length ? " — " + hints.join(", ") : ""}`;
      })
      .join("\n");

  // Dataset-level summary (counts of column kinds) so the UI can show a banner.
  const summary = {
    columnCount: cols.length,
    numericCount: profiles.filter((p) => ["integer", "decimal", "currency", "percent"].includes(p.semantic)).length,
    timeCount: profiles.filter((p) => p.semantic === "date" || p.semantic === "datetime").length,
    categoryCount: profiles.filter((p) => p.semantic === "category").length,
    textCount: profiles.filter((p) => ["text", "email", "url", "geo"].includes(p.semantic)).length,
    idCount: profiles.filter((p) => p.semantic === "id").length,
    nullishCount: profiles.filter((p) => p.nullPct > 0).length,
  };

  return NextResponse.json({
    name: meta.name,
    tableName: meta.tableName,
    rowCount: meta.rowCount,
    columns: profiles,
    schemaText,
    summary,
  });
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "k";
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 1) return n.toFixed(2);
  if (abs === 0) return "0";
  return n.toPrecision(2);
}

import { NextResponse } from "next/server";
import postgres from "postgres";
import { getActiveWorkspace } from "@/lib/workspace";
import { ingestParsed } from "@/lib/ingest";
import { sanitizeIdent } from "@/lib/sql-ident";
import type { ColType, ParsedColumn, ParsedDataset } from "@/lib/csv";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_ROWS = 100_000;

/**
 * POST /api/datasets/import-postgres { dsn, query, name? }
 *
 * Connects to an arbitrary Postgres via the supplied DSN, runs a SELECT,
 * materializes the result as a new dataset in the workspace schema. The
 * DSN is NOT persisted — it's only held for the duration of this request.
 *
 * Note: caller is trusted with the DSN. If you deploy this somewhere with
 * sensitive internal Postgres hosts on the same network, layer in an
 * allowlist on the DSN host before exposing this endpoint.
 */
export async function POST(req: Request) {
  let body: { dsn?: string; query?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const dsn = (body.dsn ?? "").trim();
  const query = (body.query ?? "").trim();
  if (!dsn) return NextResponse.json({ error: "Missing dsn" }, { status: 400 });
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });
  if (!/^postgres(ql)?:\/\//i.test(dsn)) {
    return NextResponse.json(
      { error: "DSN must start with postgres:// or postgresql://" },
      { status: 400 }
    );
  }

  // Open an isolated client.
  let client;
  try {
    client = postgres(dsn, {
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Connect failed: ${e?.message ?? e}` },
      { status: 502 }
    );
  }

  let rows: Record<string, unknown>[];
  try {
    // Use unsafe() so the user's free-form SELECT goes through verbatim.
    rows = (await client.unsafe(query)) as Record<string, unknown>[];
  } catch (e: any) {
    await client.end({ timeout: 5 });
    return NextResponse.json(
      { error: `Query failed: ${e?.message ?? e}` },
      { status: 400 }
    );
  } finally {
    // Best-effort close — don't await on success path so the response isn't held up.
  }
  client.end({ timeout: 5 }).catch(() => {});

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Query returned non-array result" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Query returned 0 rows" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Result too large (>${MAX_ROWS.toLocaleString()} rows)` },
      { status: 413 }
    );
  }

  // Build a ParsedDataset shape from the postgres-js rows.
  const colNames = Object.keys(rows[0]);
  const seen = new Set<string>();
  const columns: ParsedColumn[] = colNames.map((orig, i) => {
    let name = sanitizeIdent(orig) || `col_${i + 1}`;
    if (seen.has(name)) {
      let k = 2;
      while (seen.has(`${name}_${k}`)) k++;
      name = `${name}_${k}`;
    }
    seen.add(name);
    const type = inferColType(rows.slice(0, 1000).map((r) => r[orig]));
    return { name, originalName: orig, type };
  });

  const parsed: ParsedDataset = {
    columns,
    rows: rows.map((r) =>
      columns.map((c) => coerceForType(r[c.originalName], c.type))
    ),
  };

  const ws = await getActiveWorkspace();
  const desiredName = (body.name ?? "imported").trim() || "imported";
  try {
    const result = await ingestParsed({
      ws,
      parsed,
      desiredName,
      sourceFile: `postgres://(remote)`,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Ingest failed" },
      { status: 500 }
    );
  }
}

function inferColType(vals: unknown[]): ColType {
  let kind: "int" | "float" | "bool" | "date" | "text" | "null" = "null";
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean") {
      if (kind === "null") kind = "bool";
      else if (kind !== "bool") return "text";
      continue;
    }
    if (typeof v === "number") {
      if (Number.isInteger(v)) {
        if (kind === "null" || kind === "int") kind = "int";
        else if (kind !== "float") return "text";
      } else {
        if (kind === "null" || kind === "int" || kind === "float") kind = "float";
        else return "text";
      }
      continue;
    }
    if (v instanceof Date) {
      if (kind === "null" || kind === "date") kind = "date";
      else return "text";
      continue;
    }
    return "text";
  }
  switch (kind) {
    case "int":
      return "integer";
    case "float":
      return "double precision";
    case "bool":
      return "boolean";
    case "date":
      return "timestamptz";
    default:
      return "text";
  }
}

function coerceForType(v: unknown, type: ColType) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return type === "timestamptz" ? v : v.toISOString();
  if (type === "integer") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (type === "double precision") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "boolean") return Boolean(v);
  return String(v);
}

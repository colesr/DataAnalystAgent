"use client";

import { useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
};

type SqlResult = { columns: string[]; rows: Record<string, unknown>[] };

const NUMERIC = /int|numeric|decimal|double|real|float/i;

async function runSql(sqlText: string): Promise<SqlResult> {
  const res = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sqlText, source: "pivot" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as SqlResult;
}

function quote(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

export function PivotPanel({ datasets }: { datasets: DatasetMeta[] }) {
  const [tableName, setTableName] = useState(datasets[0]?.tableName ?? "");
  const [rowCol, setRowCol] = useState("");
  const [colCol, setColCol] = useState("");
  const [valCol, setValCol] = useState("");
  const [agg, setAgg] = useState("SUM");
  const [heatmap, setHeatmap] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  const ds = datasets.find((d) => d.tableName === tableName);

  async function build() {
    if (!ds || !rowCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const valueExpr = agg === "COUNT" ? "*" : quote(valCol || rowCol);
      let sqlText: string;
      if (!colCol) {
        // No pivot — straight aggregation
        sqlText = `
          SELECT ${quote(rowCol)} AS "${rowCol}",
                 ${agg}(${valueExpr})::float AS "${agg.toLowerCase()}"
          FROM ${quote(ds.tableName)}
          GROUP BY ${quote(rowCol)}
          ORDER BY 1
          LIMIT 200
        `;
      } else {
        // Discover the distinct column values first (cap at 20 for sanity).
        const probe = await runSql(
          `SELECT DISTINCT ${quote(colCol)}::text AS v
           FROM ${quote(ds.tableName)}
           WHERE ${quote(colCol)} IS NOT NULL
           ORDER BY v
           LIMIT 20`
        );
        const colVals = probe.rows.map((r) => String(r.v));
        if (colVals.length === 0) throw new Error(`No non-null values in ${colCol}`);
        const projections = colVals
          .map(
            (v) =>
              `${agg}(${valueExpr}) FILTER (WHERE ${quote(colCol)}::text = '${v.replace(
                /'/g,
                "''"
              )}')::float AS "${v}"`
          )
          .join(", ");
        sqlText = `
          SELECT ${quote(rowCol)} AS "${rowCol}",
                 ${projections}
          FROM ${quote(ds.tableName)}
          GROUP BY ${quote(rowCol)}
          ORDER BY 1
          LIMIT 200
        `;
      }
      const r = await runSql(sqlText);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // Derive value range across all numeric cells (excluding the row label column)
  // for the optional heatmap shading.
  const heat = (() => {
    if (!result || !heatmap) return null;
    const numericCols = result.columns.slice(1);
    let min = Infinity;
    let max = -Infinity;
    for (const r of result.rows) {
      for (const c of numericCols) {
        const v = Number(r[c]);
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
    return { min, max };
  })();

  function cellBg(v: unknown): string | undefined {
    if (!heat) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const t = (n - heat.min) / (heat.max - heat.min);
    return `rgba(167, 139, 250, ${t * 0.5})`;
  }

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Pivot Table Builder</h3>
        <div className="muted">Upload a CSV/Excel file to use the pivot builder.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Pivot Table Builder</h3>
      <div className="row">
        <div>
          <label className="lbl">Table</label>
          <select value={tableName} onChange={(e) => setTableName(e.target.value)}>
            {datasets.map((d) => (
              <option key={d.id} value={d.tableName}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">Rows</label>
          <select value={rowCol} onChange={(e) => setRowCol(e.target.value)}>
            <option value="">—</option>
            {ds?.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">Columns (optional)</label>
          <select value={colCol} onChange={(e) => setColCol(e.target.value)}>
            <option value="">—</option>
            {ds?.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">Values</label>
          <select value={valCol} onChange={(e) => setValCol(e.target.value)}>
            <option value="">—</option>
            {ds?.columns
              .filter((c) => NUMERIC.test(c.type))
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="lbl">Aggregate</label>
          <select value={agg} onChange={(e) => setAgg(e.target.value)}>
            <option>SUM</option>
            <option>AVG</option>
            <option>COUNT</option>
            <option>MIN</option>
            <option>MAX</option>
          </select>
        </div>
      </div>
      <button className="primary" disabled={!rowCol || loading} onClick={build}>
        Build pivot
      </button>
      <label
        style={{
          fontSize: 11,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginLeft: 10,
          color: "var(--muted)",
        }}
      >
        <input
          type="checkbox"
          checked={heatmap}
          onChange={(e) => setHeatmap(e.target.checked)}
          style={{ width: "auto", margin: 0 }}
        />{" "}
        heatmap cells
      </label>

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            border: "1px solid var(--err)",
            borderRadius: 4,
            color: "var(--err)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}
      {loading && <div className="muted" style={{ marginTop: 8 }}>Running…</div>}

      {result && (
        <div className="db-scroll" style={{ marginTop: 12 }}>
          <table className="db-table">
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i}>
                  {result.columns.map((c, ci) => {
                    const v = r[c];
                    const isFirst = ci === 0;
                    return (
                      <td
                        key={c}
                        style={{
                          background: isFirst ? undefined : cellBg(v),
                          fontVariantNumeric: "tabular-nums",
                          textAlign: isFirst ? "left" : "right",
                        }}
                      >
                        {v == null
                          ? ""
                          : typeof v === "number"
                          ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

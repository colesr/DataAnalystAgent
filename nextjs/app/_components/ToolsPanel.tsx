"use client";

import { useMemo, useState } from "react";
import { RealChart } from "./RealChart";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
};

type SqlResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

const NUMERIC = /int|numeric|decimal|double|real|float/i;
const TIME = /time|date/i;

async function runSql(sqlText: string): Promise<SqlResult> {
  const res = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sqlText, source: "tool" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as SqlResult;
}

function quote(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/* -------------------------------------------------------------------------- */
/* Shared form helpers                                                         */
/* -------------------------------------------------------------------------- */

function useTable(datasets: DatasetMeta[]) {
  const [tableName, setTableName] = useState(datasets[0]?.tableName ?? "");
  const ds = datasets.find((d) => d.tableName === tableName) ?? datasets[0];
  return { tableName, setTableName, ds };
}

function ColSelect({
  cols,
  value,
  onChange,
  filter,
}: {
  cols: { name: string; type: string }[];
  value: string;
  onChange: (v: string) => void;
  filter?: (c: { name: string; type: string }) => boolean;
}) {
  const filtered = filter ? cols.filter(filter) : cols;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {filtered.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function TableSelect({
  datasets,
  value,
  onChange,
}: {
  datasets: DatasetMeta[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {datasets.map((d) => (
        <option key={d.id} value={d.tableName}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function ResultBox({
  loading,
  error,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}) {
  if (loading) return <div className="muted" style={{ marginTop: 8 }}>Running…</div>;
  if (error)
    return (
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
    );
  if (!children) return null;
  return <div className="tool-result">{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Histogram                                                                   */
/* -------------------------------------------------------------------------- */

function HistogramTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [col, setCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !col) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        WITH bounds AS (
          SELECT MIN(${quote(col)})::float AS min_v, MAX(${quote(col)})::float AS max_v
          FROM ${quote(ds.tableName)}
          WHERE ${quote(col)} IS NOT NULL
        ),
        bucketed AS (
          SELECT WIDTH_BUCKET(${quote(col)}::float, b.min_v, b.max_v + 0.00001, 20) AS bucket,
                 b.min_v, b.max_v
          FROM ${quote(ds.tableName)}, bounds b
          WHERE ${quote(col)} IS NOT NULL
        )
        SELECT bucket, COUNT(*)::int AS count,
               MIN(min_v + (max_v - min_v) * (bucket - 1) / 20.0) AS lo
        FROM bucketed
        GROUP BY bucket
        ORDER BY bucket
      `;
      const r = await runSql(sqlText);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const chart = useMemo(() => {
    if (!result) return null;
    const labels = result.rows.map((r) => Number(r.lo).toFixed(2));
    const data = result.rows.map((r) => Number(r.count));
    return (
      <RealChart
        spec={{ type: "bar", title: `${col} distribution`, labels, datasets: [{ label: "count", data }] }}
      />
    );
  }, [result, col]);

  return (
    <div className="card">
      <h3>Distribution / Histogram</h3>
      <div className="muted">Numeric column distribution across 20 buckets.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Column</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={col}
            onChange={setCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
      </div>
      <button className="primary" disabled={!col || loading} onClick={run}>
        View distribution
      </button>
      <ResultBox loading={loading} error={error}>
        {chart}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Correlation matrix                                                           */
/* -------------------------------------------------------------------------- */

function CorrelationTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<{ cols: string[]; values: number[][] } | null>(null);

  async function run() {
    if (!ds) return;
    setLoading(true);
    setError(null);
    setMatrix(null);
    try {
      const numericCols = ds.columns.filter((c) => NUMERIC.test(c.type)).map((c) => c.name);
      if (numericCols.length < 2) {
        throw new Error("Need at least 2 numeric columns");
      }
      const projections = numericCols
        .flatMap((a) => numericCols.map((b) => `CORR(${quote(a)}, ${quote(b)}) AS "${a}__${b}"`))
        .join(", ");
      const sqlText = `SELECT ${projections} FROM ${quote(ds.tableName)}`;
      const r = await runSql(sqlText);
      const row = r.rows[0] ?? {};
      const values: number[][] = numericCols.map((a) =>
        numericCols.map((b) => Number(row[`${a}__${b}`] ?? 0))
      );
      setMatrix({ cols: numericCols, values });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Correlation Matrix</h3>
      <div className="muted">Pearson correlations across numeric columns.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
      </div>
      <button className="primary" disabled={loading} onClick={run}>
        Compute correlations
      </button>
      <ResultBox loading={loading} error={error}>
        {matrix && (
          <div style={{ overflow: "auto" }}>
            <table className="corr-table">
              <thead>
                <tr>
                  <th />
                  {matrix.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.cols.map((row, i) => (
                  <tr key={row}>
                    <th>{row}</th>
                    {matrix.cols.map((_, j) => {
                      const v = matrix.values[i][j];
                      const intensity = Math.min(1, Math.abs(v));
                      const bg =
                        v >= 0
                          ? `rgba(74,222,128,${intensity * 0.4})`
                          : `rgba(248,113,113,${intensity * 0.4})`;
                      return (
                        <td key={j} className="corr-cell" style={{ background: bg }}>
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Group-by                                                                     */
/* -------------------------------------------------------------------------- */

function GroupByTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [groupCol, setGroupCol] = useState("");
  const [valueCol, setValueCol] = useState("");
  const [agg, setAgg] = useState("SUM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !groupCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const valueExpr = agg === "COUNT" ? "*" : quote(valueCol || groupCol);
      const sqlText = `
        SELECT ${quote(groupCol)} AS bucket,
               ${agg}(${valueExpr})::float AS metric
        FROM ${quote(ds.tableName)}
        GROUP BY ${quote(groupCol)}
        ORDER BY metric DESC NULLS LAST
        LIMIT 30
      `;
      const r = await runSql(sqlText);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const chart = useMemo(() => {
    if (!result) return null;
    return (
      <RealChart
        spec={{
          type: "bar",
          title: `${agg}(${valueCol || "*"}) by ${groupCol}`,
          labels: result.rows.map((r) => String(r.bucket)),
          datasets: [{ label: agg, data: result.rows.map((r) => Number(r.metric)) }],
        }}
      />
    );
  }, [result, agg, valueCol, groupCol]);

  return (
    <div className="card">
      <h3>Group-by Builder</h3>
      <div className="muted">Quick aggregation without writing SQL.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Group by</label>
          <ColSelect cols={ds?.columns ?? []} value={groupCol} onChange={setGroupCol} />
        </div>
        <div>
          <label className="lbl">Value</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={valueCol}
            onChange={setValueCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
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
      <button className="primary" disabled={!groupCol || loading} onClick={run}>
        Run
      </button>
      <ResultBox loading={loading} error={error}>
        {chart}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Two-sample t-test                                                            */
/* -------------------------------------------------------------------------- */

function TTestTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [groupCol, setGroupCol] = useState("");
  const [valCol, setValCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    a: { name: string; n: number; mean: number; std: number };
    b: { name: string; n: number; mean: number; std: number };
    t: number;
    diff: number;
  } | null>(null);

  async function run() {
    if (!ds || !groupCol || !valCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        SELECT ${quote(groupCol)}::text AS grp,
               COUNT(${quote(valCol)})::int AS n,
               AVG(${quote(valCol)})::float AS mean,
               STDDEV_SAMP(${quote(valCol)})::float AS std
        FROM ${quote(ds.tableName)}
        WHERE ${quote(valCol)} IS NOT NULL AND ${quote(groupCol)} IS NOT NULL
        GROUP BY ${quote(groupCol)}
        ORDER BY n DESC
        LIMIT 2
      `;
      const r = await runSql(sqlText);
      if (r.rows.length < 2) throw new Error("Need at least 2 groups");
      const [a, b] = r.rows;
      const aN = Number(a.n);
      const bN = Number(b.n);
      const aMean = Number(a.mean);
      const bMean = Number(b.mean);
      const aStd = Number(a.std) || 0;
      const bStd = Number(b.std) || 0;
      const se = Math.sqrt((aStd * aStd) / aN + (bStd * bStd) / bN);
      const t = se > 0 ? (aMean - bMean) / se : 0;
      setResult({
        a: { name: String(a.grp), n: aN, mean: aMean, std: aStd },
        b: { name: String(b.grp), n: bN, mean: bMean, std: bStd },
        t,
        diff: aMean - bMean,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Two-Sample T-Test</h3>
      <div className="muted">Compares the means of the two largest groups in a categorical column.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Group col</label>
          <ColSelect cols={ds?.columns ?? []} value={groupCol} onChange={setGroupCol} />
        </div>
        <div>
          <label className="lbl">Value col</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={valCol}
            onChange={setValCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
      </div>
      <button className="primary" disabled={!groupCol || !valCol || loading} onClick={run}>
        Run t-test
      </button>
      <ResultBox loading={loading} error={error}>
        {result && (
          <div className="stat-grid">
            <div>
              <div className="lbl">{result.a.name}</div>
              <div className="val">{result.a.mean.toFixed(2)}</div>
              <div className="muted" style={{ fontSize: 10 }}>
                n={result.a.n} · σ={result.a.std.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="lbl">{result.b.name}</div>
              <div className="val">{result.b.mean.toFixed(2)}</div>
              <div className="muted" style={{ fontSize: 10 }}>
                n={result.b.n} · σ={result.b.std.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="lbl">Diff (a−b)</div>
              <div className="val">{result.diff.toFixed(2)}</div>
            </div>
            <div>
              <div className="lbl">t-stat</div>
              <div className="val">{result.t.toFixed(3)}</div>
              <div className="muted" style={{ fontSize: 10 }}>
                {Math.abs(result.t) > 1.96 ? "significant @ 95%" : "not significant"}
              </div>
            </div>
          </div>
        )}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Linear regression                                                            */
/* -------------------------------------------------------------------------- */

function RegressionTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [yCol, setYCol] = useState("");
  const [xCol, setXCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<{ slope: number; intercept: number; r2: number; n: number; chart: React.ReactNode } | null>(
    null
  );

  async function run() {
    if (!ds || !yCol || !xCol) return;
    setLoading(true);
    setError(null);
    setFit(null);
    try {
      const sqlText = `
        SELECT REGR_SLOPE(${quote(yCol)}::float, ${quote(xCol)}::float)::float AS slope,
               REGR_INTERCEPT(${quote(yCol)}::float, ${quote(xCol)}::float)::float AS intercept,
               REGR_R2(${quote(yCol)}::float, ${quote(xCol)}::float)::float AS r2,
               COUNT(*)::int AS n
        FROM ${quote(ds.tableName)}
        WHERE ${quote(yCol)} IS NOT NULL AND ${quote(xCol)} IS NOT NULL
      `;
      const r = await runSql(sqlText);
      const row = r.rows[0] ?? {};
      const slope = Number(row.slope);
      const intercept = Number(row.intercept);
      const r2 = Number(row.r2);
      const n = Number(row.n);
      // Pull a sample of points for the scatter plot.
      const sample = await runSql(
        `SELECT ${quote(xCol)}::float AS x, ${quote(yCol)}::float AS y
         FROM ${quote(ds.tableName)}
         WHERE ${quote(yCol)} IS NOT NULL AND ${quote(xCol)} IS NOT NULL
         LIMIT 500`
      );
      const xs = sample.rows.map((r) => Number(r.x));
      const ys = sample.rows.map((r) => Number(r.y));
      const chart = (
        <RealChart
          spec={{
            type: "scatter",
            title: `${yCol} ~ ${xCol}`,
            labels: xs,
            datasets: [{ label: "data", data: ys }],
          }}
        />
      );
      setFit({ slope, intercept, r2, n, chart });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Linear Regression</h3>
      <div className="muted">OLS fit. Returns slope, intercept, R², and a scatter of the data.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">y</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={yCol}
            onChange={setYCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">x</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={xCol}
            onChange={setXCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
      </div>
      <button className="primary" disabled={!yCol || !xCol || loading} onClick={run}>
        Fit
      </button>
      <ResultBox loading={loading} error={error}>
        {fit && (
          <>
            <div className="stat-grid">
              <div>
                <div className="lbl">slope</div>
                <div className="val">{fit.slope.toFixed(4)}</div>
              </div>
              <div>
                <div className="lbl">intercept</div>
                <div className="val">{fit.intercept.toFixed(4)}</div>
              </div>
              <div>
                <div className="lbl">R²</div>
                <div className="val">{fit.r2.toFixed(3)}</div>
              </div>
              <div>
                <div className="lbl">n</div>
                <div className="val">{fit.n.toLocaleString()}</div>
              </div>
            </div>
            {fit.chart}
          </>
        )}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pareto                                                                       */
/* -------------------------------------------------------------------------- */

function ParetoTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [catCol, setCatCol] = useState("");
  const [valCol, setValCol] = useState("");
  const [agg, setAgg] = useState("SUM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !catCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const valExpr = agg === "COUNT" ? "*" : quote(valCol || catCol);
      const sqlText = `
        WITH agg AS (
          SELECT ${quote(catCol)} AS cat, ${agg}(${valExpr})::float AS metric
          FROM ${quote(ds.tableName)}
          GROUP BY ${quote(catCol)}
          ORDER BY metric DESC NULLS LAST
          LIMIT 50
        ),
        total AS (SELECT SUM(metric) AS t FROM agg)
        SELECT cat,
               metric,
               (metric / NULLIF(total.t, 0)) * 100 AS pct,
               (SUM(metric) OVER (ORDER BY metric DESC) / NULLIF(total.t, 0)) * 100 AS cum_pct
        FROM agg, total
        ORDER BY metric DESC
      `;
      const r = await runSql(sqlText);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const chart = useMemo(() => {
    if (!result) return null;
    return (
      <>
        <RealChart
          spec={{
            type: "bar",
            title: `${agg} by ${catCol}`,
            labels: result.rows.map((r) => String(r.cat)),
            datasets: [{ label: agg, data: result.rows.map((r) => Number(r.metric)) }],
          }}
        />
        <RealChart
          spec={{
            type: "line",
            title: "Cumulative %",
            labels: result.rows.map((r) => String(r.cat)),
            datasets: [{ label: "cum %", data: result.rows.map((r) => Number(r.cum_pct)) }],
          }}
        />
      </>
    );
  }, [result, agg, catCol]);

  return (
    <div className="card">
      <h3>Pareto / 80-20</h3>
      <div className="muted">Sorts categories by metric and tracks the cumulative %.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Category</label>
          <ColSelect cols={ds?.columns ?? []} value={catCol} onChange={setCatCol} />
        </div>
        <div>
          <label className="lbl">Value</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={valCol}
            onChange={setValCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Aggregate</label>
          <select value={agg} onChange={(e) => setAgg(e.target.value)}>
            <option>SUM</option>
            <option>COUNT</option>
            <option>AVG</option>
          </select>
        </div>
      </div>
      <button className="primary" disabled={!catCol || loading} onClick={run}>
        Build Pareto
      </button>
      <ResultBox loading={loading} error={error}>
        {chart}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Forecast                                                                     */
/* -------------------------------------------------------------------------- */

function ForecastTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [dateCol, setDateCol] = useState("");
  const [valCol, setValCol] = useState("");
  const [agg, setAgg] = useState("SUM");
  const [period, setPeriod] = useState("month");
  const [periods, setPeriods] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ history: { d: string; v: number }[]; forecast: { d: string; v: number }[] } | null>(
    null
  );

  async function run() {
    if (!ds || !dateCol || !valCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        SELECT date_trunc('${period}', ${quote(dateCol)})::date AS bucket,
               ${agg}(${quote(valCol)})::float AS metric
        FROM ${quote(ds.tableName)}
        WHERE ${quote(dateCol)} IS NOT NULL AND ${quote(valCol)} IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket
      `;
      const r = await runSql(sqlText);
      const history = r.rows.map((r) => ({ d: String(r.bucket), v: Number(r.metric) }));
      if (history.length < 2) throw new Error("Need at least 2 history periods");

      // Simple linear regression on (index, value)
      const n = history.length;
      const xs = history.map((_, i) => i);
      const ys = history.map((h) => h.v);
      const xMean = xs.reduce((a, b) => a + b, 0) / n;
      const yMean = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (ys[i] - yMean);
        den += (xs[i] - xMean) ** 2;
      }
      const slope = den > 0 ? num / den : 0;
      const intercept = yMean - slope * xMean;

      // Project N more periods
      const lastDate = new Date(history[history.length - 1].d);
      const forecast: { d: string; v: number }[] = [];
      for (let i = 1; i <= periods; i++) {
        const nextDate = new Date(lastDate);
        if (period === "day") nextDate.setDate(nextDate.getDate() + i);
        else if (period === "week") nextDate.setDate(nextDate.getDate() + 7 * i);
        else if (period === "month") nextDate.setMonth(nextDate.getMonth() + i);
        else if (period === "quarter") nextDate.setMonth(nextDate.getMonth() + 3 * i);
        else if (period === "year") nextDate.setFullYear(nextDate.getFullYear() + i);
        forecast.push({
          d: nextDate.toISOString().slice(0, 10),
          v: intercept + slope * (n - 1 + i),
        });
      }
      setResult({ history, forecast });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const chart = useMemo(() => {
    if (!result) return null;
    const labels = [...result.history.map((h) => h.d), ...result.forecast.map((h) => h.d)];
    const histData = [...result.history.map((h) => h.v), ...result.forecast.map(() => NaN as any)];
    const fcData = [
      ...result.history.map(() => NaN as any),
      ...result.forecast.map((h) => h.v),
    ];
    return (
      <RealChart
        spec={{
          type: "line",
          title: `${agg}(${valCol}) by ${period}`,
          labels,
          datasets: [
            { label: "history", data: histData },
            { label: "forecast", data: fcData },
          ],
        }}
      />
    );
  }, [result, agg, valCol, period]);

  return (
    <div className="card">
      <h3>Forecast</h3>
      <div className="muted">Aggregate by date, project a linear trend N periods forward.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Date col</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={dateCol}
            onChange={setDateCol}
            filter={(c) => TIME.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Value col</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={valCol}
            onChange={setValCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Aggregate</label>
          <select value={agg} onChange={(e) => setAgg(e.target.value)}>
            <option>SUM</option>
            <option>AVG</option>
            <option>COUNT</option>
          </select>
        </div>
        <div>
          <label className="lbl">Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option>day</option>
            <option>week</option>
            <option>month</option>
            <option>quarter</option>
            <option>year</option>
          </select>
        </div>
        <div>
          <label className="lbl">Periods</label>
          <input
            type="number"
            value={periods}
            min={1}
            max={60}
            onChange={(e) => setPeriods(parseInt(e.target.value, 10) || 6)}
          />
        </div>
      </div>
      <button className="primary" disabled={!dateCol || !valCol || loading} onClick={run}>
        Forecast
      </button>
      <ResultBox loading={loading} error={error}>
        {chart}
      </ResultBox>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                        */
/* -------------------------------------------------------------------------- */

export function ToolsPanel({ datasets }: { datasets: DatasetMeta[] }) {
  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Tools</h3>
        <div className="muted">Upload a CSV/Excel file to use the tool cards.</div>
      </div>
    );
  }
  return (
    <>
      <HistogramTool datasets={datasets} />
      <CorrelationTool datasets={datasets} />
      <GroupByTool datasets={datasets} />
      <TTestTool datasets={datasets} />
      <RegressionTool datasets={datasets} />
      <ParetoTool datasets={datasets} />
      <ForecastTool datasets={datasets} />
    </>
  );
}

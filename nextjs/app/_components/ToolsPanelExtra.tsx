"use client";

/**
 * The "rest of the tools" — every card the original index.html had that
 * isn't already in ToolsPanel.tsx. Each tool is a small focused component.
 *
 * Most tools build SQL client-side and POST to /api/sql. A few that need
 * client-side math (k-means, sample size) compute the result locally.
 */

import { useMemo, useState } from "react";
import { RealChart } from "./RealChart";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
};

type SqlResult = { columns: string[]; rows: Record<string, unknown>[] };

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

function useTable(datasets: DatasetMeta[]) {
  const [tableName, setTableName] = useState(datasets[0]?.tableName ?? "");
  const ds = datasets.find((d) => d.tableName === tableName) ?? datasets[0];
  return { tableName, setTableName, ds };
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

function ColSelect({
  cols,
  value,
  onChange,
  filter,
  multi,
  size,
}: {
  cols: { name: string; type: string }[];
  value: string | string[];
  onChange: (v: any) => void;
  filter?: (c: { name: string; type: string }) => boolean;
  multi?: boolean;
  size?: number;
}) {
  const filtered = filter ? cols.filter(filter) : cols;
  if (multi) {
    return (
      <select
        multiple
        size={size ?? 5}
        value={Array.isArray(value) ? value : []}
        onChange={(e) => {
          const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
          onChange(opts);
        }}
      >
        {filtered.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }
  return (
    <select value={value as string} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {filtered.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
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

function ResultTable({ data }: { data: SqlResult }) {
  if (!data.rows.length) return <div className="muted">No rows.</div>;
  return (
    <div className="db-scroll" style={{ maxHeight: 320 }}>
      <table className="db-table">
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.slice(0, 100).map((r, i) => (
            <tr key={i}>
              {data.columns.map((c) => (
                <td key={c}>{String(r[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ========================================================================== */
/* OUTLIER DETECTION (IQR)                                                     */
/* ========================================================================== */
function OutlierTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [col, setCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ low: number; high: number; rows: SqlResult } | null>(
    null
  );

  async function run() {
    if (!ds || !col) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const stats = await runSql(`
        SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY ${quote(col)}::float) AS q1,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY ${quote(col)}::float) AS q3
        FROM ${quote(ds.tableName)}
        WHERE ${quote(col)} IS NOT NULL
      `);
      const q1 = Number(stats.rows[0]?.q1 ?? 0);
      const q3 = Number(stats.rows[0]?.q3 ?? 0);
      const iqr = q3 - q1;
      const low = q1 - 1.5 * iqr;
      const high = q3 + 1.5 * iqr;
      const outliers = await runSql(
        `SELECT * FROM ${quote(ds.tableName)} WHERE ${quote(col)}::float < ${low} OR ${quote(
          col
        )}::float > ${high} LIMIT 100`
      );
      setResult({ low, high, rows: outliers });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Outlier Detection (IQR)</h3>
      <div className="muted">
        Flag rows outside Q1−1.5·IQR or Q3+1.5·IQR for the chosen numeric column.
      </div>
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
        Find outliers
      </button>
      <ResultBox loading={loading} error={error}>
        {result && (
          <>
            <div className="muted" style={{ marginBottom: 6 }}>
              Bounds: [{result.low.toFixed(2)}, {result.high.toFixed(2)}] · {result.rows.rows.length}{" "}
              outlier{result.rows.rows.length === 1 ? "" : "s"}
            </div>
            <ResultTable data={result.rows} />
          </>
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* PERIOD-OVER-PERIOD                                                          */
/* ========================================================================== */
function PeriodOverPeriodTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [dateCol, setDateCol] = useState("");
  const [valCol, setValCol] = useState("");
  const [agg, setAgg] = useState("SUM");
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !dateCol || !valCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        WITH bucketed AS (
          SELECT date_trunc('${period}', ${quote(dateCol)})::date AS bucket,
                 ${agg}(${quote(valCol)}::float) AS metric
          FROM ${quote(ds.tableName)}
          WHERE ${quote(dateCol)} IS NOT NULL AND ${quote(valCol)} IS NOT NULL
          GROUP BY bucket
          ORDER BY bucket
        )
        SELECT bucket,
               metric,
               LAG(metric) OVER (ORDER BY bucket) AS prev,
               ((metric - LAG(metric) OVER (ORDER BY bucket)) /
                NULLIF(LAG(metric) OVER (ORDER BY bucket), 0)) * 100 AS pct_change
        FROM bucketed
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Period-over-Period</h3>
      <div className="muted">Bucket a metric by time period and compute % change vs prior bucket.</div>
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
      </div>
      <button className="primary" disabled={!dateCol || !valCol || loading} onClick={run}>
        Compare
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* JOIN TABLES                                                                  */
/* ========================================================================== */
function JoinTool({ datasets }: { datasets: DatasetMeta[] }) {
  const [leftTable, setLeftTable] = useState(datasets[0]?.tableName ?? "");
  const [rightTable, setRightTable] = useState(datasets[1]?.tableName ?? "");
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
  const [type, setType] = useState("INNER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);
  const left = datasets.find((d) => d.tableName === leftTable);
  const right = datasets.find((d) => d.tableName === rightTable);

  async function run() {
    if (!left || !right || !leftKey || !rightKey) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        SELECT a.*, b.*
        FROM ${quote(left.tableName)} a
        ${type} JOIN ${quote(right.tableName)} b ON a.${quote(leftKey)} = b.${quote(rightKey)}
        LIMIT 50
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Join Tables</h3>
      <div className="muted">Visual join builder. Preview joins across two tables.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Left table</label>
          <TableSelect datasets={datasets} value={leftTable} onChange={setLeftTable} />
        </div>
        <div>
          <label className="lbl">Left key</label>
          <ColSelect cols={left?.columns ?? []} value={leftKey} onChange={setLeftKey} />
        </div>
        <div>
          <label className="lbl">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>INNER</option>
            <option>LEFT</option>
            <option>RIGHT</option>
            <option>FULL</option>
          </select>
        </div>
        <div>
          <label className="lbl">Right table</label>
          <TableSelect datasets={datasets} value={rightTable} onChange={setRightTable} />
        </div>
        <div>
          <label className="lbl">Right key</label>
          <ColSelect cols={right?.columns ?? []} value={rightKey} onChange={setRightKey} />
        </div>
      </div>
      <button
        className="primary"
        disabled={!leftKey || !rightKey || loading || !left || !right}
        onClick={run}
      >
        Preview join
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* COHORT RETENTION                                                             */
/* ========================================================================== */
function CohortTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [userCol, setUserCol] = useState("");
  const [signupCol, setSignupCol] = useState("");
  const [activityCol, setActivityCol] = useState("");
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !userCol || !signupCol || !activityCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        WITH cohorts AS (
          SELECT ${quote(userCol)} AS uid,
                 date_trunc('${period}', MIN(${quote(signupCol)}))::date AS cohort
          FROM ${quote(ds.tableName)}
          GROUP BY ${quote(userCol)}
        ),
        activity AS (
          SELECT c.cohort,
                 date_trunc('${period}', t.${quote(activityCol)})::date AS active_period,
                 COUNT(DISTINCT c.uid) AS n
          FROM cohorts c
          JOIN ${quote(ds.tableName)} t ON t.${quote(userCol)} = c.uid
          GROUP BY c.cohort, active_period
        )
        SELECT cohort,
               active_period,
               n
        FROM activity
        ORDER BY cohort, active_period
        LIMIT 200
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Cohort Retention</h3>
      <div className="muted">Group users by signup period and track activity over time.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">User ID</label>
          <ColSelect cols={ds?.columns ?? []} value={userCol} onChange={setUserCol} />
        </div>
        <div>
          <label className="lbl">Signup date</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={signupCol}
            onChange={setSignupCol}
            filter={(c) => TIME.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Activity date</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={activityCol}
            onChange={setActivityCol}
            filter={(c) => TIME.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option>week</option>
            <option>month</option>
          </select>
        </div>
      </div>
      <button className="primary" disabled={!userCol || !signupCol || !activityCol || loading} onClick={run}>
        Compute retention
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* A/B SAMPLE SIZE (pure math, no SQL)                                         */
/* ========================================================================== */
function SampleSizeTool() {
  const [base, setBase] = useState(10);
  const [mde, setMde] = useState(2);
  const [conf, setConf] = useState(95);
  const [power, setPower] = useState(80);

  // Inverse normal approximation (Beasley-Springer-Moro is overkill — use a small lookup).
  function zForP(p: number): number {
    // Acklam's approximation
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    const ph = 1 - pl;
    let q: number, r: number;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= ph) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const result = useMemo(() => {
    const p1 = base / 100;
    const p2 = (base + mde) / 100;
    const zAlpha = zForP(1 - (1 - conf / 100) / 2);
    const zBeta = zForP(power / 100);
    const num = (zAlpha * Math.sqrt(2 * p1 * (1 - p1)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
    const denom = (p2 - p1) ** 2;
    if (denom === 0) return null;
    return Math.ceil(num / denom);
  }, [base, mde, conf, power]);

  return (
    <div className="card">
      <h3>A/B Test Sample Size</h3>
      <div className="muted">Required sample size per variant for a two-proportion z-test.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Baseline (%)</label>
          <input type="number" value={base} step={0.1} onChange={(e) => setBase(Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl">MDE (% abs)</label>
          <input type="number" value={mde} step={0.1} onChange={(e) => setMde(Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl">Confidence (%)</label>
          <input type="number" value={conf} onChange={(e) => setConf(Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl">Power (%)</label>
          <input type="number" value={power} onChange={(e) => setPower(Number(e.target.value))} />
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div>
          <div className="lbl">Per variant</div>
          <div className="val">{result?.toLocaleString() ?? "—"}</div>
        </div>
        <div>
          <div className="lbl">Total</div>
          <div className="val">{result ? (result * 2).toLocaleString() : "—"}</div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* FUNNEL                                                                       */
/* ========================================================================== */
function FunnelTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [userCol, setUserCol] = useState("");
  const [eventCol, setEventCol] = useState("");
  const [stepsText, setStepsText] = useState("visit\nsignup\npurchase");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ step: string; n: number; pct: number }[] | null>(null);

  async function run() {
    if (!ds || !userCol || !eventCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const steps = stepsText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (steps.length < 2) throw new Error("Need at least 2 steps");
      const counts: { step: string; n: number }[] = [];
      for (let i = 0; i < steps.length; i++) {
        const stepClause = steps
          .slice(0, i + 1)
          .map(
            (s) =>
              `EXISTS (SELECT 1 FROM ${quote(ds.tableName)} t2 WHERE t2.${quote(
                userCol
              )} = t1.${quote(userCol)} AND t2.${quote(eventCol)} = '${s.replace(/'/g, "''")}')`
          )
          .join(" AND ");
        const r = await runSql(
          `SELECT COUNT(DISTINCT ${quote(userCol)})::int AS n
           FROM ${quote(ds.tableName)} t1
           WHERE ${stepClause}`
        );
        counts.push({ step: steps[i], n: Number(r.rows[0]?.n ?? 0) });
      }
      const top = counts[0]?.n || 1;
      setResult(counts.map((c) => ({ ...c, pct: (c.n / top) * 100 })));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Funnel Analysis</h3>
      <div className="muted">Conversion through ordered events. Each step is a value in the event column.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">User col</label>
          <ColSelect cols={ds?.columns ?? []} value={userCol} onChange={setUserCol} />
        </div>
        <div>
          <label className="lbl">Event col</label>
          <ColSelect cols={ds?.columns ?? []} value={eventCol} onChange={setEventCol} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <label className="lbl">Steps (one per line)</label>
        <textarea className="code" rows={4} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
      </div>
      <button className="primary" disabled={!userCol || !eventCol || loading} onClick={run}>
        Compute funnel
      </button>
      <ResultBox loading={loading} error={error}>
        {result && (
          <RealChart
            spec={{
              type: "bar",
              title: "Funnel",
              labels: result.map((r) => `${r.step} (${r.pct.toFixed(0)}%)`),
              datasets: [{ label: "users", data: result.map((r) => r.n) }],
            }}
          />
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* WINDOW FUNCTIONS (generator)                                                */
/* ========================================================================== */
function WindowTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [func, setFunc] = useState("ROW_NUMBER");
  const [valCol, setValCol] = useState("");
  const [partCol, setPartCol] = useState("");
  const [orderCol, setOrderCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const partition = partCol ? `PARTITION BY ${quote(partCol)} ` : "";
      const order = orderCol ? `ORDER BY ${quote(orderCol)}` : "";
      let expr: string;
      if (func === "ROW_NUMBER") expr = `ROW_NUMBER() OVER (${partition}${order})`;
      else if (func === "RANK") expr = `RANK() OVER (${partition}${order})`;
      else if (func === "DENSE_RANK") expr = `DENSE_RANK() OVER (${partition}${order})`;
      else if (func === "LAG") expr = `LAG(${quote(valCol)}) OVER (${partition}${order})`;
      else if (func === "LEAD") expr = `LEAD(${quote(valCol)}) OVER (${partition}${order})`;
      else if (func === "SUM (running)") expr = `SUM(${quote(valCol)}::float) OVER (${partition}${order})`;
      else expr = `AVG(${quote(valCol)}::float) OVER (${partition}${order})`;

      const sqlText = `SELECT *, ${expr} AS window_result FROM ${quote(ds.tableName)} LIMIT 100`;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Window Functions</h3>
      <div className="muted">Generate window function SQL without writing it.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Function</label>
          <select value={func} onChange={(e) => setFunc(e.target.value)}>
            <option>ROW_NUMBER</option>
            <option>RANK</option>
            <option>DENSE_RANK</option>
            <option>LAG</option>
            <option>LEAD</option>
            <option>SUM (running)</option>
            <option>AVG (running)</option>
          </select>
        </div>
        <div>
          <label className="lbl">Value col</label>
          <ColSelect cols={ds?.columns ?? []} value={valCol} onChange={setValCol} />
        </div>
        <div>
          <label className="lbl">Partition by</label>
          <ColSelect cols={ds?.columns ?? []} value={partCol} onChange={setPartCol} />
        </div>
        <div>
          <label className="lbl">Order by</label>
          <ColSelect cols={ds?.columns ?? []} value={orderCol} onChange={setOrderCol} />
        </div>
      </div>
      <button className="primary" disabled={loading} onClick={run}>
        Run
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* QUANTILE BUCKETING                                                           */
/* ========================================================================== */
function QuantileTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [col, setCol] = useState("");
  const [n, setN] = useState(10);
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
        WITH ranked AS (
          SELECT NTILE(${n}) OVER (ORDER BY ${quote(col)}::float) AS bucket,
                 ${quote(col)}::float AS v
          FROM ${quote(ds.tableName)}
          WHERE ${quote(col)} IS NOT NULL
        )
        SELECT bucket, COUNT(*)::int AS n, MIN(v) AS lo, MAX(v) AS hi
        FROM ranked
        GROUP BY bucket
        ORDER BY bucket
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Quantile Bucketing</h3>
      <div className="muted">Bin a numeric column into N equal-frequency buckets.</div>
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
        <div>
          <label className="lbl">Buckets</label>
          <input type="number" value={n} min={2} max={100} onChange={(e) => setN(Number(e.target.value))} />
        </div>
      </div>
      <button className="primary" disabled={!col || loading} onClick={run}>
        Bucket
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* NORMALIZE                                                                    */
/* ========================================================================== */
function NormalizeTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [col, setCol] = useState("");
  const [method, setMethod] = useState("z-score");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !col) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let expr: string;
      if (method === "z-score") {
        expr = `(${quote(col)}::float - AVG(${quote(col)}::float) OVER ()) / NULLIF(STDDEV_SAMP(${quote(col)}::float) OVER (), 0)`;
      } else {
        expr = `(${quote(col)}::float - MIN(${quote(col)}::float) OVER ()) / NULLIF((MAX(${quote(col)}::float) OVER () - MIN(${quote(col)}::float) OVER ()), 0)`;
      }
      const sqlText = `SELECT ${quote(col)}, ${expr} AS normalized FROM ${quote(ds.tableName)} LIMIT 100`;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Normalize Column</h3>
      <div className="muted">Compute a standardized version of a numeric column.</div>
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
        <div>
          <label className="lbl">Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>z-score</option>
            <option>min-max</option>
          </select>
        </div>
      </div>
      <button className="primary" disabled={!col || loading} onClick={run}>
        Normalize
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* GEOGRAPHIC MAP (lat/lon scatter)                                            */
/* ========================================================================== */
function MapTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [latCol, setLatCol] = useState("");
  const [lonCol, setLonCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<{ lat: number; lon: number }[] | null>(null);

  async function run() {
    if (!ds || !latCol || !lonCol) return;
    setLoading(true);
    setError(null);
    setPoints(null);
    try {
      const r = await runSql(
        `SELECT ${quote(latCol)}::float AS lat, ${quote(lonCol)}::float AS lon
         FROM ${quote(ds.tableName)}
         WHERE ${quote(latCol)} IS NOT NULL AND ${quote(lonCol)} IS NOT NULL
         LIMIT 1000`
      );
      setPoints(r.rows.map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Geographic Points</h3>
      <div className="muted">
        Plots lat/lon points as a scatter. (Real basemap tiles can come in a future phase.)
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Latitude</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={latCol}
            onChange={setLatCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Longitude</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={lonCol}
            onChange={setLonCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
      </div>
      <button className="primary" disabled={!latCol || !lonCol || loading} onClick={run}>
        Plot points
      </button>
      <ResultBox loading={loading} error={error}>
        {points && (
          <RealChart
            spec={{
              type: "scatter",
              title: `${points.length} points`,
              labels: points.map((p) => p.lon),
              datasets: [{ label: "lat", data: points.map((p) => p.lat) }],
            }}
          />
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* SANKEY (table-only)                                                          */
/* ========================================================================== */
function SankeyTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [src, setSrc] = useState("");
  const [tgt, setTgt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !src || !tgt) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        SELECT ${quote(src)} AS source, ${quote(tgt)} AS target, COUNT(*)::int AS flow
        FROM ${quote(ds.tableName)}
        WHERE ${quote(src)} IS NOT NULL AND ${quote(tgt)} IS NOT NULL
        GROUP BY source, target
        ORDER BY flow DESC
        LIMIT 100
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Sankey Flow (table)</h3>
      <div className="muted">Source → target flows ranked by count.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Source</label>
          <ColSelect cols={ds?.columns ?? []} value={src} onChange={setSrc} />
        </div>
        <div>
          <label className="lbl">Target</label>
          <ColSelect cols={ds?.columns ?? []} value={tgt} onChange={setTgt} />
        </div>
      </div>
      <button className="primary" disabled={!src || !tgt || loading} onClick={run}>
        Compute flows
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* SURVIVAL CURVE (Kaplan-Meier, computed client-side)                          */
/* ========================================================================== */
function SurvivalTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [timeCol, setTimeCol] = useState("");
  const [eventCol, setEventCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curve, setCurve] = useState<{ t: number; s: number }[] | null>(null);

  async function run() {
    if (!ds || !timeCol || !eventCol) return;
    setLoading(true);
    setError(null);
    setCurve(null);
    try {
      const r = await runSql(
        `SELECT ${quote(timeCol)}::float AS t, ${quote(eventCol)}::int AS e
         FROM ${quote(ds.tableName)}
         WHERE ${quote(timeCol)} IS NOT NULL AND ${quote(eventCol)} IS NOT NULL
         ORDER BY t`
      );
      const rows = r.rows.map((row) => ({ t: Number(row.t), e: Number(row.e) }));
      // Group by t, count events and at-risk
      const byT = new Map<number, { d: number; n: number }>();
      let nAtRisk = rows.length;
      const sorted = rows;
      const out: { t: number; s: number }[] = [];
      let s = 1;
      let i = 0;
      while (i < sorted.length) {
        const t = sorted[i].t;
        let d = 0;
        let nLeavingHere = 0;
        while (i < sorted.length && sorted[i].t === t) {
          if (sorted[i].e === 1) d++;
          nLeavingHere++;
          i++;
        }
        s *= (nAtRisk - d) / nAtRisk;
        out.push({ t, s });
        nAtRisk -= nLeavingHere;
      }
      setCurve(out);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Survival Curve (Kaplan-Meier)</h3>
      <div className="muted">Time = duration observed. Event = 1 if churned/died, 0 if censored.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Time col</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={timeCol}
            onChange={setTimeCol}
            filter={(c) => NUMERIC.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Event col</label>
          <ColSelect cols={ds?.columns ?? []} value={eventCol} onChange={setEventCol} />
        </div>
      </div>
      <button className="primary" disabled={!timeCol || !eventCol || loading} onClick={run}>
        Compute
      </button>
      <ResultBox loading={loading} error={error}>
        {curve && (
          <RealChart
            spec={{
              type: "line",
              title: "Survival probability S(t)",
              labels: curve.map((p) => p.t),
              datasets: [{ label: "S(t)", data: curve.map((p) => p.s) }],
            }}
          />
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* MULTI-VAR REGRESSION (closed-form OLS via normal equations, client-side)    */
/* ========================================================================== */
function MultiRegressionTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [yCol, setYCol] = useState("");
  const [xCols, setXCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ coeffs: number[]; r2: number; n: number } | null>(null);

  async function run() {
    if (!ds || !yCol || xCols.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const cols = [yCol, ...xCols].map(quote).join(", ");
      const r = await runSql(
        `SELECT ${cols} FROM ${quote(ds.tableName)} WHERE ${[yCol, ...xCols]
          .map((c) => `${quote(c)} IS NOT NULL`)
          .join(" AND ")} LIMIT 5000`
      );
      const n = r.rows.length;
      if (n < xCols.length + 1) throw new Error("Not enough rows for fit");
      const Y = r.rows.map((row) => Number(row[yCol]));
      // Build X with intercept column
      const X = r.rows.map((row) => [1, ...xCols.map((c) => Number(row[c]))]);
      const k = xCols.length + 1;
      // X'X
      const XtX = Array.from({ length: k }, () => Array(k).fill(0));
      const XtY = Array(k).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < k; j++) {
          XtY[j] += X[i][j] * Y[i];
          for (let l = 0; l < k; l++) {
            XtX[j][l] += X[i][j] * X[i][l];
          }
        }
      }
      // Solve via Gauss-Jordan
      const aug = XtX.map((row, i) => [...row, XtY[i]]);
      for (let col = 0; col < k; col++) {
        let pivot = col;
        for (let row = col + 1; row < k; row++) {
          if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
        }
        [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
        const div = aug[col][col];
        if (div === 0) throw new Error("Singular matrix");
        for (let j = 0; j <= k; j++) aug[col][j] /= div;
        for (let row = 0; row < k; row++) {
          if (row === col) continue;
          const factor = aug[row][col];
          for (let j = 0; j <= k; j++) aug[row][j] -= factor * aug[col][j];
        }
      }
      const coeffs = aug.map((row) => row[k]);
      // R²
      const yMean = Y.reduce((a, b) => a + b, 0) / n;
      let ssRes = 0;
      let ssTot = 0;
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let j = 0; j < k; j++) pred += coeffs[j] * X[i][j];
        ssRes += (Y[i] - pred) ** 2;
        ssTot += (Y[i] - yMean) ** 2;
      }
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      setResult({ coeffs, r2, n });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Multi-variable Regression</h3>
      <div className="muted">OLS with multiple X columns. Coefficients fit via normal equations.</div>
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
      </div>
      <div style={{ marginTop: 8 }}>
        <label className="lbl">X columns (Ctrl/Cmd-click for multiple)</label>
        <ColSelect
          cols={ds?.columns ?? []}
          value={xCols}
          onChange={setXCols}
          filter={(c) => NUMERIC.test(c.type)}
          multi
          size={6}
        />
      </div>
      <button className="primary" disabled={!yCol || xCols.length === 0 || loading} onClick={run}>
        Fit
      </button>
      <ResultBox loading={loading} error={error}>
        {result && (
          <>
            <div className="stat-grid">
              <div>
                <div className="lbl">R²</div>
                <div className="val">{result.r2.toFixed(3)}</div>
              </div>
              <div>
                <div className="lbl">n</div>
                <div className="val">{result.n.toLocaleString()}</div>
              </div>
            </div>
            <table className="result-table">
              <thead>
                <tr>
                  <th>variable</th>
                  <th>coefficient</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>(intercept)</td>
                  <td>{result.coeffs[0].toFixed(4)}</td>
                </tr>
                {xCols.map((x, i) => (
                  <tr key={x}>
                    <td>{x}</td>
                    <td>{result.coeffs[i + 1].toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* CHI-SQUARED                                                                  */
/* ========================================================================== */
function ChiSqTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [aCol, setACol] = useState("");
  const [bCol, setBCol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ chi2: number; df: number; cells: SqlResult } | null>(null);

  async function run() {
    if (!ds || !aCol || !bCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await runSql(
        `SELECT ${quote(aCol)}::text AS a, ${quote(bCol)}::text AS b, COUNT(*)::int AS n
         FROM ${quote(ds.tableName)}
         WHERE ${quote(aCol)} IS NOT NULL AND ${quote(bCol)} IS NOT NULL
         GROUP BY a, b`
      );
      // Build contingency table client-side
      const aVals = Array.from(new Set(r.rows.map((row) => String(row.a))));
      const bVals = Array.from(new Set(r.rows.map((row) => String(row.b))));
      const obs = aVals.map(() => bVals.map(() => 0));
      for (const row of r.rows) {
        const i = aVals.indexOf(String(row.a));
        const j = bVals.indexOf(String(row.b));
        obs[i][j] = Number(row.n);
      }
      const total = obs.flat().reduce((a, b) => a + b, 0);
      const rowSums = obs.map((r) => r.reduce((a, b) => a + b, 0));
      const colSums = bVals.map((_, j) => obs.reduce((sum, r) => sum + r[j], 0));
      let chi2 = 0;
      for (let i = 0; i < aVals.length; i++) {
        for (let j = 0; j < bVals.length; j++) {
          const exp = (rowSums[i] * colSums[j]) / total;
          if (exp > 0) chi2 += ((obs[i][j] - exp) ** 2) / exp;
        }
      }
      const df = (aVals.length - 1) * (bVals.length - 1);
      setResult({ chi2, df, cells: r });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Chi-Squared Test</h3>
      <div className="muted">Test independence between two categorical columns.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Column A</label>
          <ColSelect cols={ds?.columns ?? []} value={aCol} onChange={setACol} />
        </div>
        <div>
          <label className="lbl">Column B</label>
          <ColSelect cols={ds?.columns ?? []} value={bCol} onChange={setBCol} />
        </div>
      </div>
      <button className="primary" disabled={!aCol || !bCol || loading} onClick={run}>
        Run test
      </button>
      <ResultBox loading={loading} error={error}>
        {result && (
          <div className="stat-grid">
            <div>
              <div className="lbl">χ² statistic</div>
              <div className="val">{result.chi2.toFixed(3)}</div>
            </div>
            <div>
              <div className="lbl">df</div>
              <div className="val">{result.df}</div>
            </div>
            <div>
              <div className="lbl">cells</div>
              <div className="val">{result.cells.rows.length}</div>
            </div>
          </div>
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* DATA DICTIONARY                                                              */
/* ========================================================================== */
function DataDictTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  return (
    <div className="card">
      <h3>Data Dictionary</h3>
      <div className="muted">Auto-generated docs of every column in the selected table.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
      </div>
      {ds && (
        <table className="result-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>column</th>
              <th>type</th>
            </tr>
          </thead>
          <tbody>
            {ds.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ========================================================================== */
/* DATE DIMENSIONS                                                              */
/* ========================================================================== */
function DateDimensionsTool({ datasets }: { datasets: DatasetMeta[] }) {
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
        SELECT ${quote(col)},
               EXTRACT(year FROM ${quote(col)})::int AS year,
               EXTRACT(quarter FROM ${quote(col)})::int AS quarter,
               EXTRACT(month FROM ${quote(col)})::int AS month,
               EXTRACT(week FROM ${quote(col)})::int AS week,
               EXTRACT(dow FROM ${quote(col)})::int AS day_of_week,
               EXTRACT(day FROM ${quote(col)})::int AS day_of_month,
               EXTRACT(doy FROM ${quote(col)})::int AS day_of_year,
               (EXTRACT(dow FROM ${quote(col)}) IN (0, 6)) AS is_weekend
        FROM ${quote(ds.tableName)}
        WHERE ${quote(col)} IS NOT NULL
        LIMIT 100
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Date Dimensions</h3>
      <div className="muted">Explode a date column into year/quarter/month/week/dow/etc.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">Date column</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={col}
            onChange={setCol}
            filter={(c) => TIME.test(c.type)}
          />
        </div>
      </div>
      <button className="primary" disabled={!col || loading} onClick={run}>
        Explode
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* SESSIONIZATION                                                               */
/* ========================================================================== */
function SessionizeTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [userCol, setUserCol] = useState("");
  const [tsCol, setTsCol] = useState("");
  const [gap, setGap] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !userCol || !tsCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        WITH lagged AS (
          SELECT ${quote(userCol)} AS uid,
                 ${quote(tsCol)} AS ts,
                 LAG(${quote(tsCol)}) OVER (PARTITION BY ${quote(userCol)} ORDER BY ${quote(tsCol)}) AS prev_ts
          FROM ${quote(ds.tableName)}
          WHERE ${quote(tsCol)} IS NOT NULL
        ),
        flagged AS (
          SELECT uid, ts,
                 CASE WHEN prev_ts IS NULL OR EXTRACT(EPOCH FROM (ts - prev_ts))/60 > ${gap} THEN 1 ELSE 0 END AS new_session
          FROM lagged
        )
        SELECT uid, ts,
               SUM(new_session) OVER (PARTITION BY uid ORDER BY ts) AS session_id
        FROM flagged
        ORDER BY uid, ts
        LIMIT 200
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Sessionization</h3>
      <div className="muted">Group events into sessions per user when the gap exceeds N minutes.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">User col</label>
          <ColSelect cols={ds?.columns ?? []} value={userCol} onChange={setUserCol} />
        </div>
        <div>
          <label className="lbl">Timestamp col</label>
          <ColSelect
            cols={ds?.columns ?? []}
            value={tsCol}
            onChange={setTsCol}
            filter={(c) => TIME.test(c.type)}
          />
        </div>
        <div>
          <label className="lbl">Idle gap (min)</label>
          <input type="number" value={gap} min={1} onChange={(e) => setGap(Number(e.target.value))} />
        </div>
      </div>
      <button className="primary" disabled={!userCol || !tsCol || loading} onClick={run}>
        Sessionize
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* ROLLING WINDOW                                                               */
/* ========================================================================== */
function RollingTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [valCol, setValCol] = useState("");
  const [orderCol, setOrderCol] = useState("");
  const [func, setFunc] = useState("AVG");
  const [n, setN] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);

  async function run() {
    if (!ds || !valCol || !orderCol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const sqlText = `
        SELECT ${quote(orderCol)},
               ${quote(valCol)},
               ${func}(${quote(valCol)}::float) OVER (ORDER BY ${quote(orderCol)} ROWS BETWEEN ${
        n - 1
      } PRECEDING AND CURRENT ROW) AS rolling
        FROM ${quote(ds.tableName)}
        ORDER BY ${quote(orderCol)}
        LIMIT 200
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Rolling Window</h3>
      <div className="muted">Add a rolling-window aggregate (e.g. 7-period moving average).</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
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
          <label className="lbl">Order by</label>
          <ColSelect cols={ds?.columns ?? []} value={orderCol} onChange={setOrderCol} />
        </div>
        <div>
          <label className="lbl">Function</label>
          <select value={func} onChange={(e) => setFunc(e.target.value)}>
            <option>AVG</option>
            <option>SUM</option>
            <option>MIN</option>
            <option>MAX</option>
          </select>
        </div>
        <div>
          <label className="lbl">Window</label>
          <input type="number" value={n} min={2} onChange={(e) => setN(Number(e.target.value))} />
        </div>
      </div>
      <button className="primary" disabled={!valCol || !orderCol || loading} onClick={run}>
        Run
      </button>
      <ResultBox loading={loading} error={error}>
        {result && <ResultTable data={result} />}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* K-MEANS (client-side)                                                        */
/* ========================================================================== */
function KMeansTool({ datasets }: { datasets: DatasetMeta[] }) {
  const { tableName, setTableName, ds } = useTable(datasets);
  const [k, setK] = useState(3);
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ centroids: number[][]; sizes: number[] } | null>(null);

  async function run() {
    if (!ds || features.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await runSql(
        `SELECT ${features.map(quote).join(", ")} FROM ${quote(ds.tableName)} WHERE ${features
          .map((c) => `${quote(c)} IS NOT NULL`)
          .join(" AND ")} LIMIT 5000`
      );
      const data = r.rows.map((row) => features.map((c) => Number(row[c])));
      // z-score
      const means = features.map((_, j) => data.reduce((a, row) => a + row[j], 0) / data.length);
      const stds = features.map(
        (_, j) => Math.sqrt(data.reduce((a, row) => a + (row[j] - means[j]) ** 2, 0) / data.length) || 1
      );
      const X = data.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));
      // Init centroids: pick K random rows
      const centroids: number[][] = [];
      for (let i = 0; i < k; i++) centroids.push(X[Math.floor(Math.random() * X.length)].slice());
      let assignments = X.map(() => 0);
      for (let iter = 0; iter < 30; iter++) {
        // Assign
        const newAssign = X.map((row) => {
          let best = 0;
          let bestDist = Infinity;
          for (let c = 0; c < k; c++) {
            let d = 0;
            for (let j = 0; j < row.length; j++) d += (row[j] - centroids[c][j]) ** 2;
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          }
          return best;
        });
        const changed = newAssign.some((v, i) => v !== assignments[i]);
        assignments = newAssign;
        if (!changed && iter > 0) break;
        // Update centroids
        for (let c = 0; c < k; c++) {
          const members = X.filter((_, i) => assignments[i] === c);
          if (members.length === 0) continue;
          for (let j = 0; j < features.length; j++) {
            centroids[c][j] = members.reduce((a, m) => a + m[j], 0) / members.length;
          }
        }
      }
      const sizes = Array(k).fill(0);
      for (const a of assignments) sizes[a]++;
      // De-standardize centroids
      const denorm = centroids.map((c) => c.map((v, j) => v * stds[j] + means[j]));
      setResult({ centroids: denorm, sizes });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>K-means Clustering</h3>
      <div className="muted">Cluster rows into K groups based on selected numeric features. Z-scored.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label className="lbl">Table</label>
          <TableSelect datasets={datasets} value={tableName} onChange={setTableName} />
        </div>
        <div>
          <label className="lbl">K</label>
          <input type="number" value={k} min={2} max={20} onChange={(e) => setK(Number(e.target.value))} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <label className="lbl">Features</label>
        <ColSelect
          cols={ds?.columns ?? []}
          value={features}
          onChange={setFeatures}
          filter={(c) => NUMERIC.test(c.type)}
          multi
          size={6}
        />
      </div>
      <button className="primary" disabled={features.length === 0 || loading} onClick={run}>
        Cluster
      </button>
      <ResultBox loading={loading} error={error}>
        {result && (
          <table className="result-table">
            <thead>
              <tr>
                <th>cluster</th>
                <th>size</th>
                {features.map((f) => (
                  <th key={f}>{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.centroids.map((c, i) => (
                <tr key={i}>
                  <td>{i}</td>
                  <td>{result.sizes[i]}</td>
                  {c.map((v, j) => (
                    <td key={j}>{v.toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* DATA ASSERTIONS                                                              */
/* ========================================================================== */
function AssertionsTool({ datasets }: { datasets: DatasetMeta[] }) {
  const [text, setText] = useState(
    datasets[0]
      ? `No null primary key | SELECT * FROM ${datasets[0].tableName} WHERE ${
          datasets[0].columns[0]?.name ?? "id"
        } IS NULL`
      : "Description | SELECT ... WHERE <bad condition>"
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ desc: string; n: number; ok: boolean; error?: string }[] | null>(
    null
  );

  async function run() {
    setLoading(true);
    setResults(null);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const out: { desc: string; n: number; ok: boolean; error?: string }[] = [];
    for (const line of lines) {
      const idx = line.indexOf("|");
      if (idx < 0) continue;
      const desc = line.slice(0, idx).trim();
      const sqlText = line.slice(idx + 1).trim();
      try {
        const r = await runSql(sqlText);
        out.push({ desc, n: r.rows.length, ok: r.rows.length === 0 });
      } catch (e: any) {
        out.push({ desc, n: 0, ok: false, error: e?.message ?? String(e) });
      }
    }
    setResults(out);
    setLoading(false);
  }

  return (
    <div className="card">
      <h3>Data Assertions</h3>
      <div className="muted">
        Each line: <code>description | SQL that should return 0 rows</code>. Persist to alerts table
        via the Alerts card if you want them scheduled.
      </div>
      <textarea className="code" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="primary" disabled={loading} onClick={run}>
        Run assertions
      </button>
      <ResultBox loading={loading}>
        {results && (
          <div>
            {results.map((r, i) => (
              <div key={i} className="qh-row">
                <span
                  className="qh-source"
                  style={{
                    background: r.ok ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                    color: r.ok ? "var(--success)" : "var(--err)",
                  }}
                >
                  {r.ok ? "ok" : "fail"}
                </span>
                <span className="qh-sql">{r.desc}</span>
                <span className="muted">{r.error ?? `${r.n} rows`}</span>
              </div>
            ))}
          </div>
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* TREEMAP (table-only)                                                         */
/* ========================================================================== */
function TreemapTool({ datasets }: { datasets: DatasetMeta[] }) {
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
        SELECT ${quote(catCol)} AS category, ${agg}(${valExpr})::float AS metric
        FROM ${quote(ds.tableName)}
        GROUP BY ${quote(catCol)}
        ORDER BY metric DESC NULLS LAST
        LIMIT 30
      `;
      setResult(await runSql(sqlText));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // Render as a packed div grid where each rect's area is proportional to metric.
  const blocks = useMemo(() => {
    if (!result) return null;
    const total = result.rows.reduce((a, r) => a + Number(r.metric), 0) || 1;
    return result.rows.map((r) => ({
      label: String(r.category),
      pct: (Number(r.metric) / total) * 100,
    }));
  }, [result]);

  return (
    <div className="card">
      <h3>Treemap</h3>
      <div className="muted">Each rectangle's size is proportional to its share of the total.</div>
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
        Build treemap
      </button>
      <ResultBox loading={loading} error={error}>
        {blocks && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: 4,
              background: "var(--bg)",
              borderRadius: 4,
              border: "1px solid var(--border)",
              minHeight: 240,
            }}
          >
            {blocks.map((b, i) => (
              <div
                key={i}
                title={`${b.label}: ${b.pct.toFixed(1)}%`}
                style={{
                  flex: `${Math.max(b.pct, 0.5)} 0 ${Math.max(50, b.pct * 4)}px`,
                  minHeight: Math.max(40, b.pct * 3),
                  background: `rgba(167, 139, 250, ${0.2 + b.pct / 100})`,
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  padding: 6,
                  fontSize: 11,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <div style={{ fontWeight: 600 }}>{b.label}</div>
                <div className="muted" style={{ fontSize: 10 }}>
                  {b.pct.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </ResultBox>
    </div>
  );
}

/* ========================================================================== */
/* PANEL                                                                        */
/* ========================================================================== */
export function ToolsPanelExtra({ datasets }: { datasets: DatasetMeta[] }) {
  if (datasets.length === 0) return null;
  return (
    <>
      <OutlierTool datasets={datasets} />
      <PeriodOverPeriodTool datasets={datasets} />
      <JoinTool datasets={datasets} />
      <CohortTool datasets={datasets} />
      <SampleSizeTool />
      <FunnelTool datasets={datasets} />
      <WindowTool datasets={datasets} />
      <QuantileTool datasets={datasets} />
      <NormalizeTool datasets={datasets} />
      <MapTool datasets={datasets} />
      <SankeyTool datasets={datasets} />
      <SurvivalTool datasets={datasets} />
      <MultiRegressionTool datasets={datasets} />
      <ChiSqTool datasets={datasets} />
      <DataDictTool datasets={datasets} />
      <DateDimensionsTool datasets={datasets} />
      <SessionizeTool datasets={datasets} />
      <RollingTool datasets={datasets} />
      <KMeansTool datasets={datasets} />
      <AssertionsTool datasets={datasets} />
      <TreemapTool datasets={datasets} />
    </>
  );
}

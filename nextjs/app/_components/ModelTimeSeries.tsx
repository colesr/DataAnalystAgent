"use client";

import { useEffect, useMemo, useState } from "react";
import { mean, sampleStandardDeviation } from "simple-statistics";
import { RealChart } from "./RealChart";
import {
  asNumberArray,
  numericColumns,
  quoteId,
  runSql,
  temporalColumns,
  type DatasetMeta,
} from "./model-utils";

type Decomp = {
  labels: string[];
  values: number[];
  trend: number[];
  residuals: number[];
  window: number;
};

function movingAverage(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (window < 1) return values.slice();
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    let n = 0;
    for (let j = lo; j <= hi; j++) {
      if (Number.isFinite(values[j])) {
        sum += values[j];
        n++;
      }
    }
    out[i] = n > 0 ? sum / n : NaN;
  }
  return out;
}

export function ModelTimeSeries({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const ds = useMemo(() => datasets.find((d) => d.id === datasetId), [datasets, datasetId]);
  const tCols = useMemo(() => (ds ? temporalColumns(ds) : []), [ds]);
  const nCols = useMemo(() => (ds ? numericColumns(ds) : []), [ds]);
  const [tCol, setTCol] = useState<string>("");
  const [vCol, setVCol] = useState<string>("");
  const [windowSize, setWindowSize] = useState<number>(7);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Decomp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);
  useEffect(() => {
    setTCol((c) => (tCols.includes(c) ? c : tCols[0] ?? ""));
    setVCol((c) => (nCols.includes(c) ? c : nCols[0] ?? ""));
    setResult(null);
  }, [tCols, nCols]);

  async function run() {
    if (!ds || !tCol || !vCol) {
      setError("Pick a time column and a numeric value column.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const rows = await runSql(
        `SELECT ${quoteId(tCol)} AS t, ${quoteId(vCol)} AS v
         FROM ${quoteId(ds.tableName)}
         WHERE ${quoteId(tCol)} IS NOT NULL AND ${quoteId(vCol)} IS NOT NULL
         ORDER BY ${quoteId(tCol)} ASC
         LIMIT 5000`
      );
      const labels = rows.map((r) => String(r.t));
      const values = asNumberArray(rows, "v");
      if (values.length < windowSize * 2) {
        throw new Error(`Need at least ${windowSize * 2} rows; got ${values.length}.`);
      }
      const trend = movingAverage(values, windowSize);
      const residuals = values.map((v, i) =>
        Number.isFinite(v) && Number.isFinite(trend[i]) ? v - trend[i] : NaN
      );
      setResult({ labels: labels.slice(0, values.length), values, trend, residuals, window: windowSize });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <h3>Time-series decomposition</h3>
      {datasets.length === 0 ? (
        <div className="muted">Upload a dataset first.</div>
      ) : (
        <>
          <div className="model-section">
            <label className="lbl">Dataset</label>
            <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {(tCols.length === 0 || nCols.length === 0) ? (
            <div className="muted">Need a time/date column and a numeric value column.</div>
          ) : (
            <>
              <div className="model-row">
                <div>
                  <label className="lbl">Time column</label>
                  <select value={tCol} onChange={(e) => setTCol(e.target.value)}>
                    {tCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Value column</label>
                  <select value={vCol} onChange={(e) => setVCol(e.target.value)}>
                    {nCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <label className="lbl">Moving-average window (periods)</label>
              <input
                type="number"
                min={3}
                max={365}
                value={windowSize}
                onChange={(e) => setWindowSize(Math.max(3, Math.min(365, Number(e.target.value))))}
              />
              <button className="primary" onClick={run} disabled={running} style={{ marginTop: 8 }}>
                {running ? "Decomposing…" : "Decompose"}
              </button>
              {error && <div className="webllm-err" style={{ marginTop: 10 }}>{error}</div>}
              {result && (
                <div className="model-result">
                  <h4>Trend + residual (window = {result.window})</h4>
                  <RealChart
                    spec={{
                      type: "line",
                      title: `${vCol} — observed vs trend`,
                      labels: result.labels,
                      datasets: [
                        { label: "observed", data: result.values },
                        { label: `trend (MA${result.window})`, data: result.trend },
                      ],
                    }}
                  />
                  <RealChart
                    spec={{
                      type: "line",
                      title: "Residuals (observed − trend)",
                      labels: result.labels,
                      datasets: [{ label: "residual", data: result.residuals }],
                    }}
                  />
                  <p className="muted" style={{ marginTop: 8 }}>
                    Residual std: {sampleStandardDeviation(result.residuals.filter((v) => Number.isFinite(v))).toFixed(3)}.
                    Larger residuals concentrated in any window suggest a regime change worth investigating.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

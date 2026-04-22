"use client";

import { useEffect, useMemo, useState } from "react";
import {
  linearRegression,
  linearRegressionLine,
  rSquared,
  sampleStandardDeviation,
} from "simple-statistics";
import {
  asNumberArray,
  numericColumns,
  quoteId,
  runSql,
  type DatasetMeta,
} from "./model-utils";

type Result = {
  slope: number;
  intercept: number;
  rSquared: number;
  n: number;
  residualStddev: number;
  xLabel: string;
  yLabel: string;
};

export function ModelRegression({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const ds = useMemo(() => datasets.find((d) => d.id === datasetId), [datasets, datasetId]);
  const numCols = useMemo(() => (ds ? numericColumns(ds) : []), [ds]);
  const [xCol, setXCol] = useState<string>("");
  const [yCol, setYCol] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    if (numCols.length >= 2) {
      setXCol((c) => (numCols.includes(c) ? c : numCols[0]));
      setYCol((c) => (numCols.includes(c) ? c : numCols[1]));
    } else {
      setXCol("");
      setYCol("");
    }
    setResult(null);
  }, [numCols]);

  async function run() {
    if (!ds || !xCol || !yCol || xCol === yCol) {
      setError("Pick two distinct numeric columns.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const rows = await runSql(
        `SELECT ${quoteId(xCol)} AS x, ${quoteId(yCol)} AS y FROM ${quoteId(ds.tableName)} WHERE ${quoteId(xCol)} IS NOT NULL AND ${quoteId(yCol)} IS NOT NULL LIMIT 10000`
      );
      const xs = asNumberArray(rows, "x");
      const ys = asNumberArray(rows, "y");
      const n = Math.min(xs.length, ys.length);
      if (n < 3) throw new Error(`Not enough data (n=${n}). Need at least 3 paired rows.`);
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) pairs.push([xs[i], ys[i]]);
      const reg = linearRegression(pairs);
      const line = linearRegressionLine(reg);
      const r2 = rSquared(pairs, line);
      const residuals = pairs.map(([x, y]) => y - line(x));
      const residualStd = residuals.length > 1 ? sampleStandardDeviation(residuals) : 0;
      setResult({
        slope: reg.m,
        intercept: reg.b,
        rSquared: r2,
        n,
        residualStddev: residualStd,
        xLabel: xCol,
        yLabel: yCol,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <h3>Regression</h3>
      {datasets.length === 0 ? (
        <div className="muted">Upload a dataset with numeric columns first.</div>
      ) : (
        <>
          <div className="model-section">
            <label className="lbl">Dataset</label>
            <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {numCols.length < 2 ? (
            <div className="muted">
              Need at least 2 numeric columns; this dataset has {numCols.length}.
            </div>
          ) : (
            <>
              <div className="model-row">
                <div>
                  <label className="lbl">Independent variable (X)</label>
                  <select value={xCol} onChange={(e) => setXCol(e.target.value)}>
                    {numCols.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Dependent variable (Y)</label>
                  <select value={yCol} onChange={(e) => setYCol(e.target.value)}>
                    {numCols.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="primary" onClick={run} disabled={running}>
                {running ? "Fitting…" : "Fit linear regression"}
              </button>
              {error && <div className="webllm-err" style={{ marginTop: 10 }}>{error}</div>}
              {result && (
                <div className="model-result">
                  <h4>Linear fit: {result.yLabel} ~ {result.xLabel}</h4>
                  <div className="model-stat-row">
                    <span className="label">Equation</span>
                    <span className="value">
                      {result.yLabel} = {result.slope.toFixed(4)} × {result.xLabel} + {result.intercept.toFixed(4)}
                    </span>
                  </div>
                  <div className="model-stat-row">
                    <span className="label">R²</span>
                    <span className="value">{result.rSquared.toFixed(4)}</span>
                  </div>
                  <div className="model-stat-row">
                    <span className="label">Slope</span>
                    <span className="value">{result.slope.toFixed(4)}</span>
                  </div>
                  <div className="model-stat-row">
                    <span className="label">Intercept</span>
                    <span className="value">{result.intercept.toFixed(4)}</span>
                  </div>
                  <div className="model-stat-row">
                    <span className="label">Residual std</span>
                    <span className="value">{result.residualStddev.toFixed(4)}</span>
                  </div>
                  <div className="model-stat-row">
                    <span className="label">Sample size</span>
                    <span className="value">{result.n.toLocaleString()}</span>
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>
                    {result.rSquared >= 0.7
                      ? `Strong linear relationship (R² ${result.rSquared.toFixed(2)}).`
                      : result.rSquared >= 0.3
                      ? `Moderate linear relationship — there's signal but a lot of variance unexplained.`
                      : `Weak linear relationship — the variables don't track each other linearly.`}
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

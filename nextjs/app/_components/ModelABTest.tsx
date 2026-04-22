"use client";

import { useEffect, useMemo, useState } from "react";
import {
  mean,
  sampleStandardDeviation,
  tTestTwoSample,
} from "simple-statistics";
import {
  asNumberArray,
  categoricalColumns,
  numericColumns,
  quoteId,
  runSql,
  type DatasetMeta,
} from "./model-utils";

type Result =
  | { kind: "ttest"; aN: number; bN: number; aMean: number; bMean: number; aStd: number; bStd: number; t: number; pApprox: number }
  | { kind: "prop"; aN: number; bN: number; aRate: number; bRate: number; lift: number; z: number; pApprox: number };

/** Two-sided p-value approximation from a z-statistic via the standard normal CDF. */
function pFromZ(z: number): number {
  const a = Math.abs(z);
  // Abramowitz & Stegun 7.1.26 approximation
  const t = 1 / (1 + 0.3275911 * a);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  const oneSided = 1 - 0.5 * (1 + erf);
  return Math.min(1, 2 * oneSided);
}

function verdict(p: number): string {
  if (p < 0.001) return "very strong evidence (p < 0.001)";
  if (p < 0.01) return "strong evidence (p < 0.01)";
  if (p < 0.05) return "significant (p < 0.05)";
  if (p < 0.1) return "marginal (p < 0.1)";
  return "no significant difference";
}

export function ModelABTest({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const ds = useMemo(() => datasets.find((d) => d.id === datasetId), [datasets, datasetId]);
  const numCols = useMemo(() => (ds ? numericColumns(ds) : []), [ds]);
  const catCols = useMemo(() => (ds ? categoricalColumns(ds) : []), [ds]);
  const [variantCol, setVariantCol] = useState<string>("");
  const [aLabel, setALabel] = useState<string>("");
  const [bLabel, setBLabel] = useState<string>("");
  const [outcomeCol, setOutcomeCol] = useState<string>("");
  const [mode, setMode] = useState<"continuous" | "binary">("continuous");
  const [variantValues, setVariantValues] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    setVariantCol((c) => (catCols.includes(c) ? c : catCols[0] ?? ""));
    setOutcomeCol((c) => (numCols.includes(c) ? c : numCols[0] ?? ""));
    setResult(null);
    setVariantValues([]);
  }, [catCols, numCols]);

  // Load distinct variant values when variantCol changes.
  useEffect(() => {
    if (!ds || !variantCol) return;
    runSql(
      `SELECT ${quoteId(variantCol)} AS v, COUNT(*) AS n FROM ${quoteId(ds.tableName)}
       WHERE ${quoteId(variantCol)} IS NOT NULL
       GROUP BY 1 ORDER BY 2 DESC LIMIT 20`
    )
      .then((rows) => {
        const vals = rows.map((r) => String(r.v));
        setVariantValues(vals);
        if (vals.length >= 2) {
          setALabel(vals[0]);
          setBLabel(vals[1]);
        }
      })
      .catch(() => setVariantValues([]));
  }, [ds, variantCol]);

  async function run() {
    if (!ds || !variantCol || !outcomeCol || !aLabel || !bLabel || aLabel === bLabel) {
      setError("Pick a variant column, two distinct variant values, and an outcome column.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const aRows = await runSql(
        `SELECT ${quoteId(outcomeCol)} AS v FROM ${quoteId(ds.tableName)}
         WHERE ${quoteId(variantCol)} = '${aLabel.replace(/'/g, "''")}' AND ${quoteId(outcomeCol)} IS NOT NULL
         LIMIT 50000`
      );
      const bRows = await runSql(
        `SELECT ${quoteId(outcomeCol)} AS v FROM ${quoteId(ds.tableName)}
         WHERE ${quoteId(variantCol)} = '${bLabel.replace(/'/g, "''")}' AND ${quoteId(outcomeCol)} IS NOT NULL
         LIMIT 50000`
      );
      const a = asNumberArray(aRows, "v");
      const b = asNumberArray(bRows, "v");
      if (a.length < 2 || b.length < 2) throw new Error(`Need at least 2 rows per variant. Got ${a.length} / ${b.length}.`);

      if (mode === "continuous") {
        const aMean = mean(a);
        const bMean = mean(b);
        const aStd = sampleStandardDeviation(a);
        const bStd = sampleStandardDeviation(b);
        const tStat = tTestTwoSample(a, b) ?? 0;
        const p = pFromZ(tStat); // approx — t with df>30 ≈ z
        setResult({ kind: "ttest", aN: a.length, bN: b.length, aMean, bMean, aStd, bStd, t: tStat, pApprox: p });
      } else {
        // Binary: treat outcome as 0/1; rates = mean
        const aRate = mean(a);
        const bRate = mean(b);
        const pPool = (a.reduce((s, x) => s + x, 0) + b.reduce((s, x) => s + x, 0)) / (a.length + b.length);
        const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.length + 1 / b.length));
        const z = se === 0 ? 0 : (aRate - bRate) / se;
        const p = pFromZ(z);
        const lift = bRate === 0 ? 0 : (aRate - bRate) / bRate;
        setResult({ kind: "prop", aN: a.length, bN: b.length, aRate, bRate, lift, z, pApprox: p });
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <h3>A/B significance test</h3>
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
          <div className="model-row">
            <div>
              <label className="lbl">Variant column</label>
              <select value={variantCol} onChange={(e) => setVariantCol(e.target.value)}>
                {catCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Outcome column</label>
              <select value={outcomeCol} onChange={(e) => setOutcomeCol(e.target.value)}>
                {numCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="model-row">
            <div>
              <label className="lbl">Variant A</label>
              <select value={aLabel} onChange={(e) => setALabel(e.target.value)}>
                {variantValues.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Variant B</label>
              <select value={bLabel} onChange={(e) => setBLabel(e.target.value)}>
                {variantValues.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <label className="lbl">Outcome type</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as "continuous" | "binary")}>
            <option value="continuous">Continuous (Welch's t-test)</option>
            <option value="binary">Binary 0/1 (two-proportion z-test)</option>
          </select>
          <button className="primary" onClick={run} disabled={running} style={{ marginTop: 8 }}>
            {running ? "Testing…" : "Run test"}
          </button>
          {error && <div className="webllm-err" style={{ marginTop: 10 }}>{error}</div>}
          {result && (
            <div className="model-result">
              <h4>Result</h4>
              {result.kind === "ttest" ? (
                <>
                  <div className="model-stat-row"><span className="label">Variant A ({aLabel})</span><span className="value">n={result.aN}, mean={result.aMean.toFixed(3)}, std={result.aStd.toFixed(3)}</span></div>
                  <div className="model-stat-row"><span className="label">Variant B ({bLabel})</span><span className="value">n={result.bN}, mean={result.bMean.toFixed(3)}, std={result.bStd.toFixed(3)}</span></div>
                  <div className="model-stat-row"><span className="label">t-statistic</span><span className="value">{result.t.toFixed(4)}</span></div>
                  <div className="model-stat-row"><span className="label">p-value (approx)</span><span className="value">{result.pApprox.toFixed(4)}</span></div>
                </>
              ) : (
                <>
                  <div className="model-stat-row"><span className="label">Variant A ({aLabel})</span><span className="value">n={result.aN}, rate={(result.aRate * 100).toFixed(2)}%</span></div>
                  <div className="model-stat-row"><span className="label">Variant B ({bLabel})</span><span className="value">n={result.bN}, rate={(result.bRate * 100).toFixed(2)}%</span></div>
                  <div className="model-stat-row"><span className="label">Relative lift (A vs B)</span><span className="value">{(result.lift * 100).toFixed(2)}%</span></div>
                  <div className="model-stat-row"><span className="label">z-statistic</span><span className="value">{result.z.toFixed(4)}</span></div>
                  <div className="model-stat-row"><span className="label">p-value (approx)</span><span className="value">{result.pApprox.toFixed(4)}</span></div>
                </>
              )}
              <p className="muted" style={{ marginTop: 8 }}>{verdict(result.pApprox)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

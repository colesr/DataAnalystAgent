"use client";

import { useEffect, useMemo, useState } from "react";
import { mean, sampleStandardDeviation } from "simple-statistics";
import {
  asNumberArray,
  numericColumns,
  quoteId,
  runSql,
  type DatasetMeta,
} from "./model-utils";

type ClusterSummary = {
  k: number;
  size: number;
  centroid: number[];
};

type Result = {
  cols: string[];
  clusters: ClusterSummary[];
  totalPoints: number;
};

/**
 * Lightweight k-means: random init, run up to 50 iterations or until centroids
 * stabilize. Pure JS, no extra deps. Good enough for the in-browser preview.
 */
function kmeans(points: number[][], k: number, maxIter = 50): { labels: number[]; centroids: number[][] } {
  if (points.length === 0) return { labels: [], centroids: [] };
  const dim = points[0].length;
  // Init: pick k random distinct points
  const seen = new Set<number>();
  const centroids: number[][] = [];
  while (centroids.length < k && seen.size < points.length) {
    const idx = Math.floor(Math.random() * points.length);
    if (seen.has(idx)) continue;
    seen.add(idx);
    centroids.push(points[idx].slice());
  }
  while (centroids.length < k) {
    centroids.push(new Array(dim).fill(0));
  }
  let labels = new Array(points.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    const newLabels = points.map((p) => {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let i = 0; i < dim; i++) {
          const diff = p[i] - centroids[c][i];
          d += diff * diff;
        }
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    });
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      if (newLabels[i] !== labels[i]) changed = true;
    }
    labels = newLabels;
    // Update centroids
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = labels[i];
      counts[c]++;
      for (let j = 0; j < dim; j++) sums[c][j] += points[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
    if (!changed && iter > 0) break;
  }
  return { labels, centroids };
}

export function ModelClustering({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const ds = useMemo(() => datasets.find((d) => d.id === datasetId), [datasets, datasetId]);
  const numCols = useMemo(() => (ds ? numericColumns(ds) : []), [ds]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [k, setK] = useState(3);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    setSelectedCols(numCols.slice(0, 3));
    setResult(null);
  }, [numCols]);

  function toggle(col: string) {
    setSelectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }

  async function run() {
    if (!ds || selectedCols.length < 2) {
      setError("Pick at least 2 numeric columns.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const cols = selectedCols.map((c) => `${quoteId(c)} AS ${quoteId(c)}`).join(", ");
      const where = selectedCols.map((c) => `${quoteId(c)} IS NOT NULL`).join(" AND ");
      const rows = await runSql(
        `SELECT ${cols} FROM ${quoteId(ds.tableName)} WHERE ${where} LIMIT 10000`
      );
      // Z-score normalize each column so clustering isn't dominated by scale.
      const cols2 = selectedCols;
      const series = cols2.map((c) => asNumberArray(rows, c));
      const n = Math.min(...series.map((s) => s.length));
      if (n < k * 2) throw new Error(`Not enough data (n=${n}) for k=${k} clusters.`);
      const means = series.map((s) => mean(s));
      const stds = series.map((s) => sampleStandardDeviation(s) || 1);
      const points: number[][] = [];
      for (let i = 0; i < n; i++) {
        const p = cols2.map((_, j) => (series[j][i] - means[j]) / stds[j]);
        points.push(p);
      }
      const { labels, centroids } = kmeans(points, k);
      // Re-project centroids back to raw units for readability.
      const summaries: ClusterSummary[] = centroids.map((c, idx) => ({
        k: idx + 1,
        size: labels.filter((l) => l === idx).length,
        centroid: c.map((v, j) => v * stds[j] + means[j]),
      }));
      setResult({ cols: cols2, clusters: summaries, totalPoints: n });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <h3>K-means clustering</h3>
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
          {numCols.length < 2 ? (
            <div className="muted">Need at least 2 numeric columns.</div>
          ) : (
            <>
              <label className="lbl">Columns to cluster on (z-score normalized)</label>
              <div className="define-list" style={{ marginBottom: 12 }}>
                {numCols.map((c) => (
                  <label key={c} className={`define-list-item ${selectedCols.includes(c) ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selectedCols.includes(c)}
                      onChange={() => toggle(c)}
                    />
                    <span className="define-list-item-name">{c}</span>
                  </label>
                ))}
              </div>
              <div className="model-row">
                <div>
                  <label className="lbl">Number of clusters (k)</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={k}
                    onChange={(e) => setK(Math.max(2, Math.min(10, Number(e.target.value))))}
                  />
                </div>
                <div style={{ alignSelf: "end" }}>
                  <button className="primary" onClick={run} disabled={running}>
                    {running ? "Clustering…" : "Run k-means"}
                  </button>
                </div>
              </div>
              {error && <div className="webllm-err" style={{ marginTop: 10 }}>{error}</div>}
              {result && (
                <div className="model-result">
                  <h4>{result.clusters.length} clusters · {result.totalPoints.toLocaleString()} points</h4>
                  {result.clusters.map((c) => (
                    <div key={c.k} className="model-stat-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="label"><strong>Cluster {c.k}</strong></span>
                        <span className="value">{c.size.toLocaleString()} pts ({((c.size / result.totalPoints) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Centroid: {result.cols.map((col, i) => `${col}=${c.centroid[i].toFixed(2)}`).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { quoteId, runSql, type DatasetMeta } from "./model-utils";

type Group = {
  canonical: string;
  variants: { value: string; count: number }[];
  totalCount: number;
};

/** Levenshtein distance between two strings, with an early-exit cap. */
function levenshtein(a: string, b: string, cap = 10): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

/** Cluster values where pairwise distance ≤ threshold. Greedy single-link. */
function clusterByDistance(values: { v: string; c: number }[], threshold: number): Group[] {
  // Largest counts get to be canonicals first.
  const sorted = [...values].sort((a, b) => b.c - a.c);
  const groups: Group[] = [];
  for (const item of sorted) {
    let placed = false;
    for (const g of groups) {
      if (
        levenshtein(item.v.toLowerCase(), g.canonical.toLowerCase(), threshold) <= threshold
      ) {
        g.variants.push({ value: item.v, count: item.c });
        g.totalCount += item.c;
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({
        canonical: item.v,
        variants: [{ value: item.v, count: item.c }],
        totalCount: item.c,
      });
    }
  }
  // Only return groups that actually have ≥2 variants.
  return groups.filter((g) => g.variants.length >= 2).sort((a, b) => b.totalCount - a.totalCount);
}

export function CleanFuzzyDedupe({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const ds = useMemo(() => datasets.find((d) => d.id === datasetId), [datasets, datasetId]);
  const textCols = useMemo(
    () =>
      ds
        ? ds.columns
            .filter((c) => /text|char|varchar/i.test(c.type))
            .map((c) => c.name)
        : [],
    [ds]
  );
  const [col, setCol] = useState<string>("");
  const [threshold, setThreshold] = useState(2);
  const [groups, setGroups] = useState<Group[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);
  useEffect(() => {
    setCol((c) => (textCols.includes(c) ? c : textCols[0] ?? ""));
    setGroups([]);
  }, [textCols]);

  async function run() {
    if (!ds || !col) return;
    setRunning(true);
    setError(null);
    setGroups([]);
    try {
      const rows = await runSql(
        `SELECT ${quoteId(col)} AS v, COUNT(*) AS c
         FROM ${quoteId(ds.tableName)}
         WHERE ${quoteId(col)} IS NOT NULL
         GROUP BY 1
         ORDER BY 2 DESC
         LIMIT 1000`
      );
      const values = rows.map((r) => ({ v: String(r.v), c: Number(r.c) }));
      const found = clusterByDistance(values, threshold);
      setGroups(found);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <h3>Fuzzy dedupe — preview</h3>
      {datasets.length === 0 ? (
        <div className="muted">Upload a dataset first.</div>
      ) : textCols.length === 0 ? (
        <div className="muted">Need a text column.</div>
      ) : (
        <>
          <div className="model-row">
            <div>
              <label className="lbl">Dataset</label>
              <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Column</label>
              <select value={col} onChange={(e) => setCol(e.target.value)}>
                {textCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <label className="lbl">Edit-distance threshold (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(1, Math.min(5, Number(e.target.value))))}
          />
          <button className="primary" onClick={run} disabled={running} style={{ marginTop: 8 }}>
            {running ? "Scanning…" : "Find near-duplicates"}
          </button>
          <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
            Compares the top 1,000 distinct values and groups any within {threshold} character
            edits. Results are preview-only — to merge, write a manual SQL UPDATE in Workbench.
          </div>
          {error && <div className="webllm-err" style={{ marginTop: 10 }}>{error}</div>}
          {groups.length > 0 && (
            <div className="model-result">
              <h4>{groups.length} candidate groups</h4>
              {groups.slice(0, 25).map((g, i) => (
                <div key={i} className="model-stat-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label"><strong>{g.canonical}</strong></span>
                    <span className="value">{g.totalCount.toLocaleString()} rows total</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    Variants: {g.variants.map((v) => `"${v.value}" (${v.count})`).join(", ")}
                  </div>
                </div>
              ))}
              {groups.length > 25 && (
                <p className="muted" style={{ marginTop: 8 }}>
                  Showing first 25 of {groups.length} groups.
                </p>
              )}
            </div>
          )}
          {!running && groups.length === 0 && (
            <p className="muted" style={{ marginTop: 8 }}>
              No near-duplicates found at threshold {threshold}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

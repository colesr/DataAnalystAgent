"use client";

import { useEffect, useMemo, useState } from "react";
import { quoteId, runSql, type DatasetMeta } from "./model-utils";

type Sample = { input: string; match: string | null };

export function CleanRegexExtractor({
  datasets,
  onAdded,
}: {
  datasets: DatasetMeta[];
  onAdded?: () => void;
}) {
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
  const [pattern, setPattern] = useState<string>("(\\d+)");
  const [newColName, setNewColName] = useState<string>("extracted");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);
  useEffect(() => {
    setCol((c) => (textCols.includes(c) ? c : textCols[0] ?? ""));
    setSamples([]);
  }, [textCols]);

  async function preview() {
    if (!ds || !col || !pattern) return;
    setLoading(true);
    setError(null);
    setSamples([]);
    setAppliedMsg(null);
    try {
      // Verify the regex compiles client-side first (helps user catch typos).
      try {
        new RegExp(pattern);
      } catch (e: any) {
        throw new Error(`Invalid regex: ${e?.message ?? e}`);
      }
      // Pull sample rows and apply Postgres regex match server-side.
      const rows = await runSql(
        `SELECT ${quoteId(col)} AS input, (regexp_match(${quoteId(col)}, '${pattern.replace(/'/g, "''")}'))[1] AS m
         FROM ${quoteId(ds.tableName)}
         WHERE ${quoteId(col)} IS NOT NULL
         LIMIT 25`
      );
      setSamples(rows.map((r) => ({ input: String(r.input), match: r.m == null ? null : String(r.m) })));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!ds || !col || !pattern || !newColName) return;
    setLoading(true);
    setError(null);
    setAppliedMsg(null);
    try {
      const res = await fetch(`/api/datasets/${ds.id}/clean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "add_column",
          colName: newColName,
          type: "text",
          expr: `(regexp_match(${quoteId(col)}, '${pattern.replace(/'/g, "''")}'))[1]`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAppliedMsg(`Added column "${newColName}".`);
      onAdded?.();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Regex extractor</h3>
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
              <label className="lbl">Source column</label>
              <select value={col} onChange={(e) => setCol(e.target.value)}>
                {textCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <label className="lbl">Pattern (POSIX-style; first capture group is extracted)</label>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="(\\d+)  e.g. capture digits, [A-Z]{2,}, ^([^@]+)@"
          />
          <label className="lbl" style={{ marginTop: 8 }}>New column name</label>
          <input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="ghost tiny" onClick={preview} disabled={loading}>
              Preview
            </button>
            <button className="primary" style={{ marginTop: 0 }} onClick={apply} disabled={loading}>
              {loading ? "Applying…" : "Add as new column"}
            </button>
          </div>
          {error && <div className="webllm-err" style={{ marginTop: 10 }}>{error}</div>}
          {appliedMsg && (
            <div className="muted" style={{ marginTop: 8, color: "var(--success)" }}>
              {appliedMsg}
            </div>
          )}
          {samples.length > 0 && (
            <div className="model-result">
              <h4>Preview (first {samples.length} rows)</h4>
              <table className="eda-summary-table">
                <thead>
                  <tr>
                    <th>Input</th>
                    <th>Extracted</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((s, i) => (
                    <tr key={i}>
                      <td>{s.input.slice(0, 80)}</td>
                      <td><code>{s.match ?? "—"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  rowCount: number;
  columns: { name: string; type: string }[];
};

type ColumnProfile = {
  name: string;
  type: string;
  semantic: string;
  total: number;
  nonNull: number;
  distinct: number;
  nullPct: number;
  uniquePct: number;
  min?: string | null;
  max?: string | null;
  mean?: number | null;
  stddev?: number | null;
  median?: number | null;
};

type ProfileResponse = {
  rowCount: number;
  columns: ColumnProfile[];
};

function fmt(v: unknown, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return v.toFixed(digits);
  }
  return String(v);
}

export function EdaAutoSummary({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    if (!datasetId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/datasets/${datasetId}/profile`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setProfile(data);
      })
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [datasetId]);

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Auto-summary</h3>
        <div className="muted">Upload a dataset first to see column-level statistics.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>
        Auto-summary
        {profile && (
          <span className="badge">{profile.rowCount.toLocaleString()} rows</span>
        )}
      </h3>
      <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.rowCount.toLocaleString()} rows)
          </option>
        ))}
      </select>
      <div className="muted" style={{ marginTop: 8, marginBottom: 8 }}>
        Per-column statistics. Numeric columns get min / max / mean / stddev / median; all
        columns show null and uniqueness rates.
      </div>
      {loading && <div className="muted">Profiling…</div>}
      {error && (
        <div className="webllm-err">
          {error}
        </div>
      )}
      {profile && !loading && (
        <div className="db-scroll">
          <table className="eda-summary-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Nulls %</th>
                <th>Distinct</th>
                <th>Min</th>
                <th>Max</th>
                <th>Mean</th>
                <th>Median</th>
                <th>Stddev</th>
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((c) => (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td>
                  <td><span className="muted">{c.semantic}</span></td>
                  <td>{c.nullPct.toFixed(1)}%</td>
                  <td>{c.distinct.toLocaleString()}</td>
                  <td>{fmt(c.min)}</td>
                  <td>{fmt(c.max)}</td>
                  <td>{fmt(c.mean)}</td>
                  <td>{fmt(c.median)}</td>
                  <td>{fmt(c.stddev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

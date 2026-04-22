"use client";

import { useEffect, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  rowCount: number;
  columns: { name: string; type: string }[];
};

type ColumnMissing = {
  name: string;
  total: number;
  nonNull: number;
  nullPct: number;
};

export function CleanMissingHeatmap({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const [cols, setCols] = useState<ColumnMissing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    if (!datasetId) {
      setCols([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/datasets/${datasetId}/profile`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        const cs: ColumnMissing[] = (d.columns ?? []).map((c: any) => ({
          name: c.name,
          total: c.total,
          nonNull: c.nonNull,
          nullPct: c.nullPct,
        }));
        cs.sort((a, b) => b.nullPct - a.nullPct);
        setCols(cs);
      })
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [datasetId]);

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Missing-value heatmap</h3>
        <div className="muted">Upload a dataset to see where nulls cluster.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>
        Missing-value heatmap
        {cols.length > 0 && (
          <span className="badge">{cols.filter((c) => c.nullPct > 0).length} cols with nulls</span>
        )}
      </h3>
      <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <div className="muted" style={{ marginTop: 8 }}>
        Sorted by missingness. Each bar shows the share of NULLs in that column.
      </div>
      {loading && <div className="muted" style={{ marginTop: 8 }}>Profiling…</div>}
      {error && <div className="webllm-err" style={{ marginTop: 8 }}>{error}</div>}
      {!loading && cols.length > 0 && (
        <div className="missing-heatmap">
          {cols.map((c) => (
            <div key={c.name} className="missing-row">
              <div className="missing-label" title={c.name}>{c.name}</div>
              <div className="missing-bar">
                <div className="missing-bar-fill" style={{ width: `${c.nullPct}%` }} />
                <div className="missing-bar-pct">
                  {c.nullPct.toFixed(1)}% · {(c.total - c.nonNull).toLocaleString()} missing
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

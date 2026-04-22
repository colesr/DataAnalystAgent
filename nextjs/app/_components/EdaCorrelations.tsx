"use client";

import { useEffect, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  rowCount: number;
  columns: { name: string; type: string }[];
};

type CorrResponse = {
  columns: string[];
  matrix: number[][];
  sampleSize: number;
  note?: string;
};

function corrColor(v: number): string {
  // Diverging palette: red for negative, neutral for 0, green for positive.
  const a = Math.min(1, Math.abs(v));
  if (v >= 0) return `rgba(74, 222, 128, ${a * 0.65})`; // green
  return `rgba(248, 113, 113, ${a * 0.65})`; // red
}

export function EdaCorrelations({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const [data, setData] = useState<CorrResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    if (!datasetId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/eda/correlations?datasetId=${datasetId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [datasetId]);

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Correlation matrix</h3>
        <div className="muted">Upload a dataset with numeric columns first.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>
        Correlation matrix
        {data && data.sampleSize > 0 && (
          <span className="badge">sample {data.sampleSize.toLocaleString()}</span>
        )}
      </h3>
      <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <div className="muted" style={{ marginTop: 8, marginBottom: 8 }}>
        Pairwise Pearson correlation across up to 20 numeric columns. Values range from -1
        (perfect negative) to +1 (perfect positive). Cell color encodes magnitude and sign.
      </div>
      {loading && <div className="muted">Computing…</div>}
      {error && <div className="webllm-err">{error}</div>}
      {data?.note && <div className="muted">{data.note}</div>}
      {data && data.matrix.length > 0 && (
        <div className="db-scroll">
          <table className="eda-corr-table">
            <thead>
              <tr>
                <th></th>
                {data.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((row, i) => (
                <tr key={data.columns[i]}>
                  <th>{data.columns[i]}</th>
                  {row.map((v, j) => (
                    <td
                      key={j}
                      className="corr-cell"
                      style={{ background: corrColor(v) }}
                      title={`${data.columns[i]} vs ${data.columns[j]}: ${v.toFixed(3)}`}
                    >
                      {v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

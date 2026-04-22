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
  p25?: number | null;
  p75?: number | null;
  topValues?: { value: string; count: number }[];
};

type Insight = {
  level: "info" | "warn" | "alert";
  title: string;
  desc: string;
};

/**
 * Apply a small set of heuristics to a column profile, returning any
 * insights worth surfacing. Deterministic — no LLM involved.
 */
function deriveInsights(p: ColumnProfile, totalRows: number): Insight[] {
  const out: Insight[] = [];

  // Empty-ish column
  if (p.nullPct >= 90) {
    out.push({
      level: "alert",
      title: `${p.name} is ${p.nullPct.toFixed(0)}% null`,
      desc: "Almost every value is missing — consider dropping this column or sourcing the data elsewhere.",
    });
  } else if (p.nullPct >= 30) {
    out.push({
      level: "warn",
      title: `${p.name} has heavy missingness`,
      desc: `${p.nullPct.toFixed(0)}% null. Decide whether to impute, drop rows, or treat null as a category.`,
    });
  }

  // Single-value column
  if (p.distinct === 1 && p.nonNull > 0) {
    out.push({
      level: "warn",
      title: `${p.name} is constant`,
      desc: `Every non-null row has the same value — column carries no signal.`,
    });
  }

  // Highly unique column (probably an id) but not labeled as id
  if (p.uniquePct >= 99 && p.semantic !== "id" && p.nonNull > 50) {
    out.push({
      level: "info",
      title: `${p.name} looks like an identifier`,
      desc: `${p.uniquePct.toFixed(1)}% unique — likely a unique id, won't aggregate usefully.`,
    });
  }

  // Categorical concentration
  if (p.topValues && p.topValues.length > 0 && p.nonNull > 0) {
    const top = p.topValues[0];
    const dominance = (top.count / p.nonNull) * 100;
    if (dominance >= 80 && p.distinct > 1) {
      out.push({
        level: "warn",
        title: `${p.name}: "${top.value.slice(0, 40)}" dominates`,
        desc: `${dominance.toFixed(0)}% of non-null rows share this single value — splits will be skewed.`,
      });
    }
  }

  // Possible outliers from IQR rule
  if (
    p.median != null &&
    p.p25 != null &&
    p.p75 != null &&
    p.min != null &&
    p.max != null
  ) {
    const iqr = Number(p.p75) - Number(p.p25);
    if (iqr > 0) {
      const lo = Number(p.p25) - 1.5 * iqr;
      const hi = Number(p.p75) + 1.5 * iqr;
      const minN = Number(p.min);
      const maxN = Number(p.max);
      if (Number.isFinite(minN) && Number.isFinite(maxN)) {
        if (minN < lo || maxN > hi) {
          out.push({
            level: "info",
            title: `${p.name} has likely outliers`,
            desc: `Min/max sit outside the 1.5×IQR fence around the median (${Number(p.median).toFixed(2)}).`,
          });
        }
      }
    }
  }

  // High cardinality categorical
  if (
    /text|category|varchar/i.test(p.semantic + " " + p.type) &&
    p.distinct > 50 &&
    p.distinct / Math.max(1, p.nonNull) < 0.5 &&
    p.nonNull >= 100
  ) {
    out.push({
      level: "info",
      title: `${p.name} has ${p.distinct} distinct values`,
      desc: `Probably needs grouping or normalization before charting.`,
    });
  }

  return out;
}

export function EdaInsights({ datasets }: { datasets: DatasetMeta[] }) {
  const [datasetId, setDatasetId] = useState<string>("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);

  useEffect(() => {
    if (!datasetId) {
      setInsights([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/datasets/${datasetId}/profile`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const totalRows = data.rowCount ?? 0;
        setRowCount(totalRows);
        const all: Insight[] = [];
        for (const col of data.columns ?? []) {
          for (const ins of deriveInsights(col, totalRows)) all.push(ins);
        }
        // Order by severity: alert > warn > info
        const order: Record<Insight["level"], number> = { alert: 0, warn: 1, info: 2 };
        all.sort((a, b) => order[a.level] - order[b.level]);
        setInsights(all);
      })
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [datasetId]);

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Interesting facts</h3>
        <div className="muted">Upload a dataset to surface insights.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>
        Interesting facts
        {!loading && insights.length > 0 && (
          <span className="badge">{insights.length} found</span>
        )}
      </h3>
      <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.rowCount.toLocaleString()} rows)
          </option>
        ))}
      </select>
      <div className="muted" style={{ marginTop: 8, marginBottom: 12 }}>
        Heuristic scan: missing-value clusters, single-value columns, categorical
        dominance, probable outliers (1.5×IQR), high-cardinality text columns.
      </div>
      {loading && <div className="muted">Scanning…</div>}
      {error && <div className="webllm-err">{error}</div>}
      {!loading && !error && insights.length === 0 && (
        <div className="muted">
          Nothing notable found. {rowCount.toLocaleString()} rows scanned across{" "}
          {datasets.find((d) => d.id === datasetId)?.columns.length ?? 0} columns.
        </div>
      )}
      {insights.map((ins, i) => (
        <div key={i} className={`insight-card ${ins.level === "info" ? "" : ins.level}`}>
          <div className="insight-card-title">{ins.title}</div>
          <div className="insight-card-desc">{ins.desc}</div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
};

type ColumnProfile = {
  name: string;
  type: string;
  total: number;
  nonNull: number;
  distinct: number;
  nullPct: number;
  min?: string | null;
  max?: string | null;
  topValues?: { value: string; count: number }[];
};

type ProfileResponse = {
  name: string;
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  schemaText: string;
};

export function SchemaProfile({
  datasets,
  onError,
}: {
  datasets: DatasetMeta[];
  onError: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected && datasets[0]) setSelected(datasets[0].id);
  }, [datasets, selected]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setProfile(null);
    fetch(`/api/datasets/${selected}/profile`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setProfile(data as ProfileResponse))
      .catch((e) => onError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [selected, onError]);

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Data Profile</h3>
        <div className="muted">Upload a CSV/Excel file to see its profile.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h3>
          Data Profile{" "}
          {profile && <span className="badge">{profile.columns.length} columns</span>}
        </h3>
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.rowCount.toLocaleString()} rows
            </option>
          ))}
        </select>

        {loading && <div className="muted">Loading profile…</div>}

        {profile && (
          <div className="profile-grid">
            {profile.columns.map((c) => {
              const fillPct = c.total > 0 ? (c.nonNull / c.total) * 100 : 0;
              const isPK = c.distinct === c.total && c.total > 0;
              return (
                <div key={c.name} className="profile-col">
                  <div className="name">
                    {c.name}
                    <span className="type">{c.type}</span>
                  </div>
                  <div className="stat">
                    <span>non-null</span>
                    <span>
                      {c.nonNull.toLocaleString()} ({fillPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="bar">
                    <div style={{ width: `${fillPct}%` }} />
                  </div>
                  <div className="stat">
                    <span>distinct</span>
                    <span>{c.distinct.toLocaleString()}</span>
                  </div>
                  {c.min != null && (
                    <div className="stat">
                      <span>min / max</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>
                        {c.min} / {c.max}
                      </span>
                    </div>
                  )}
                  {c.topValues && c.topValues.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {c.topValues.map((tv, i) => {
                        const pct = c.nonNull > 0 ? (tv.count / c.nonNull) * 100 : 0;
                        return (
                          <div key={i} className="stat">
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 110,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {tv.value || "∅"}
                            </span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isPK && <span className="flag key">unique</span>}
                  {c.nullPct > 50 && !isPK && <span className="flag warn">{c.nullPct.toFixed(0)}% null</span>}
                  {c.nullPct === 100 && <span className="flag err">all null</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {profile && (
        <div className="card">
          <h3>Schema Text (sent to agent)</h3>
          <pre
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: 10,
              margin: 0,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {profile.schemaText}
          </pre>
        </div>
      )}
    </>
  );
}

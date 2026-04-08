"use client";

import { useEffect, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
};

type ToastFn = (kind: "success" | "err" | "info", text: string) => void;

export function CleanPanel({
  datasets,
  onChanged,
  toast,
}: {
  datasets: DatasetMeta[];
  onChanged: () => void;
  toast: ToastFn;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && datasets[0]) setSelectedId(datasets[0].id);
  }, [datasets, selectedId]);

  const ds = datasets.find((d) => d.id === selectedId) ?? null;

  async function call(body: object): Promise<unknown> {
    if (!ds) return null;
    const res = await fetch(`/api/datasets/${ds.id}/clean`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  }

  async function dedupe() {
    try {
      const r: any = await call({ op: "dedupe" });
      toast("success", `Removed ${r.removed} duplicate rows`);
      onChanged();
    } catch (e: any) {
      toast("err", e?.message ?? String(e));
    }
  }

  async function parseDates() {
    if (!ds) return;
    const col = window.prompt(
      `Which column to parse as a date?\nColumns: ${ds.columns.map((c) => c.name).join(", ")}`
    );
    if (!col) return;
    try {
      await call({ op: "parse_dates", column: col });
      toast("success", `Parsed ${col} as timestamptz`);
      onChanged();
    } catch (e: any) {
      toast("err", e?.message ?? String(e));
    }
  }

  async function dropTable() {
    if (!ds) return;
    if (!confirm(`Drop "${ds.name}"? This deletes the underlying table.`)) return;
    try {
      await call({ op: "drop" });
      toast("success", `Dropped ${ds.name}`);
      setSelectedId(null);
      onChanged();
    } catch (e: any) {
      toast("err", e?.message ?? String(e));
    }
  }

  async function addColumn() {
    if (!ds) return;
    const name = window.prompt("New column name:");
    if (!name) return;
    const type =
      window.prompt("Type (double precision / integer / text / boolean):", "double precision") ??
      "double precision";
    const expression = window.prompt("Expression (raw SQL, e.g. revenue - cost):");
    if (!expression) return;
    try {
      await call({ op: "add_column", name, type, expression });
      toast("success", `Added ${name}`);
      onChanged();
    } catch (e: any) {
      toast("err", e?.message ?? String(e));
    }
  }

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Clean & Transform</h3>
        <div className="muted">Upload a CSV/Excel file to get started.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Clean & Transform</h3>
      <div className="muted" style={{ marginBottom: 10 }}>
        Operations apply immediately to the underlying Postgres table.
      </div>
      <select
        value={selectedId ?? ""}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{ marginBottom: 12 }}
      >
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} — {d.rowCount.toLocaleString()} rows · {d.columns.length} cols
          </option>
        ))}
      </select>

      {ds && (
        <div style={{ marginBottom: 12 }}>
          {ds.columns.map((c) => (
            <div key={c.name} className="col-row">
              <span className="col-name">{c.name}</span>
              <span className="col-type">{c.type}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="ghost" onClick={dedupe}>
          Remove duplicate rows
        </button>
        <button className="ghost" onClick={parseDates}>
          Parse a column as dates
        </button>
        <button className="ghost" onClick={addColumn}>
          Add calculated column
        </button>
        <button className="ghost danger" onClick={dropTable}>
          Drop table
        </button>
      </div>
    </div>
  );
}

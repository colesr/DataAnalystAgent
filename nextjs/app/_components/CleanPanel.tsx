"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";

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
  const [parseDialogOpen, setParseDialogOpen] = useState(false);
  const [parseCol, setParseCol] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCol, setNewCol] = useState({ name: "", type: "double precision", expression: "" });

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

  function openParseDates() {
    if (!ds) return;
    setParseCol(ds.columns[0]?.name ?? "");
    setParseDialogOpen(true);
  }

  async function confirmParseDates() {
    if (!parseCol) return;
    try {
      await call({ op: "parse_dates", column: parseCol });
      toast("success", `Parsed ${parseCol} as timestamptz`);
      setParseDialogOpen(false);
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

  function openAddColumn() {
    if (!ds) return;
    setNewCol({ name: "", type: "double precision", expression: "" });
    setAddDialogOpen(true);
  }

  async function confirmAddColumn() {
    if (!newCol.name.trim() || !newCol.expression.trim()) return;
    try {
      await call({
        op: "add_column",
        name: newCol.name.trim(),
        type: newCol.type,
        expression: newCol.expression.trim(),
      });
      toast("success", `Added ${newCol.name}`);
      setAddDialogOpen(false);
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
        <button className="ghost" onClick={openParseDates}>
          Parse a column as dates
        </button>
        <button className="ghost" onClick={openAddColumn}>
          Add calculated column
        </button>
        <button className="ghost danger" onClick={dropTable}>
          Drop table
        </button>
      </div>

      <Modal
        open={parseDialogOpen}
        onClose={() => setParseDialogOpen(false)}
        title="Parse column as dates"
        footer={
          <>
            <button className="ghost" onClick={() => setParseDialogOpen(false)}>
              Cancel
            </button>
            <button className="primary" style={{ marginTop: 0 }} onClick={confirmParseDates}>
              Parse
            </button>
          </>
        }
      >
        <label className="lbl">Column</label>
        <select value={parseCol} onChange={(e) => setParseCol(e.target.value)}>
          {ds?.columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
        <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>
          Unparseable values become NULL.
        </div>
      </Modal>

      <Modal
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add calculated column"
        maxWidth={500}
        footer={
          <>
            <button className="ghost" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </button>
            <button
              className="primary"
              style={{ marginTop: 0 }}
              onClick={confirmAddColumn}
              disabled={!newCol.name.trim() || !newCol.expression.trim()}
            >
              Add column
            </button>
          </>
        }
      >
        <label className="lbl">Name</label>
        <input
          value={newCol.name}
          onChange={(e) => setNewCol({ ...newCol, name: e.target.value })}
          placeholder="margin"
        />
        <label className="lbl" style={{ marginTop: 8 }}>
          Type
        </label>
        <select
          value={newCol.type}
          onChange={(e) => setNewCol({ ...newCol, type: e.target.value })}
        >
          <option>double precision</option>
          <option>integer</option>
          <option>text</option>
          <option>boolean</option>
          <option>timestamptz</option>
        </select>
        <label className="lbl" style={{ marginTop: 8 }}>
          Expression
        </label>
        <textarea
          className="code"
          rows={3}
          value={newCol.expression}
          onChange={(e) => setNewCol({ ...newCol, expression: e.target.value })}
          placeholder="revenue - cost"
        />
      </Modal>
    </div>
  );
}

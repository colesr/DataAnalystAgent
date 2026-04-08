"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { RealChart } from "./RealChart";

type Dashboard = { id: string; name: string };
type Tile = {
  id: string;
  title: string;
  sql: string;
  chartType: string;
  position: number;
};
type SqlResult = { columns: string[]; rows: Record<string, unknown>[] };

const TILE_TYPES = ["bar", "line", "pie", "doughnut", "scatter", "big_number", "table"] as const;

async function runSql(sqlText: string): Promise<SqlResult> {
  const res = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sqlText, source: "dashboard" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as SqlResult;
}

export function DashboardPanel({
  toast,
}: {
  toast: (kind: "success" | "err" | "info", text: string) => void;
}) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTiles, setActiveTiles] = useState<Tile[]>([]);
  const [showAddTile, setShowAddTile] = useState(false);
  const [tileTitle, setTileTitle] = useState("");
  const [tileSql, setTileSql] = useState("");
  const [tileType, setTileType] = useState<string>("bar");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDashName, setNewDashName] = useState("");

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboards", { cache: "no-store" });
      if (!res.ok) return;
      const data: { dashboards: Dashboard[] } = await res.json();
      setDashboards(data.dashboards);
      if (!activeId && data.dashboards[0]) setActiveId(data.dashboards[0].id);
    } catch {}
  }, [activeId]);

  const fetchActive = useCallback(async () => {
    if (!activeId) {
      setActiveTiles([]);
      return;
    }
    try {
      const res = await fetch(`/api/dashboards/${activeId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setActiveTiles(data.tiles ?? []);
    } catch {}
  }, [activeId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  function openCreateDialog() {
    setNewDashName("");
    setCreateDialogOpen(true);
  }

  async function confirmCreateDashboard() {
    const name = newDashName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActiveId(data.id);
      setCreateDialogOpen(false);
      await fetchList();
      toast("success", `Created "${name}"`);
    } catch (e: any) {
      toast("err", `Create failed: ${e?.message ?? e}`);
    }
  }

  async function deleteDashboard() {
    if (!activeId) return;
    const d = dashboards.find((x) => x.id === activeId);
    if (!d) return;
    if (!confirm(`Delete dashboard "${d.name}"?`)) return;
    try {
      const res = await fetch(`/api/dashboards/${activeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActiveId(null);
      await fetchList();
      toast("success", "Deleted");
    } catch (e: any) {
      toast("err", `Delete failed: ${e?.message ?? e}`);
    }
  }

  async function addTile() {
    if (!activeId || !tileTitle.trim() || !tileSql.trim()) return;
    try {
      const res = await fetch(`/api/dashboards/${activeId}/tiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tileTitle, sql: tileSql, chartType: tileType }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setTileTitle("");
      setTileSql("");
      setShowAddTile(false);
      await fetchActive();
      toast("success", "Tile added");
    } catch (e: any) {
      toast("err", `Add tile failed: ${e?.message ?? e}`);
    }
  }

  async function deleteTile(id: string) {
    try {
      const res = await fetch(`/api/dashboards/tiles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchActive();
    } catch (e: any) {
      toast("err", `Delete tile failed: ${e?.message ?? e}`);
    }
  }

  return (
    <>
      <div className="card">
        <h3>
          Dashboard
          <span className="right">
            <button
              className="ghost tiny"
              disabled={!activeId}
              onClick={() => setShowAddTile((s) => !s)}
            >
              + Add tile
            </button>
          </span>
        </h3>
        <div className="dash-toolbar">
          <select
            value={activeId ?? ""}
            onChange={(e) => setActiveId(e.target.value || null)}
            disabled={dashboards.length === 0}
          >
            {dashboards.length === 0 && <option value="">No dashboards yet</option>}
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="ghost tiny" onClick={openCreateDialog}>
            + New
          </button>
          <button
            className="ghost tiny danger"
            disabled={!activeId}
            onClick={deleteDashboard}
          >
            Delete
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Each tile runs its SQL on render against your workspace schema. Supports{" "}
          {TILE_TYPES.join(" / ")}.
        </div>

        {showAddTile && activeId && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <input
              placeholder="Tile title"
              value={tileTitle}
              onChange={(e) => setTileTitle(e.target.value)}
            />
            <textarea
              className="code"
              rows={3}
              placeholder="SELECT label, value FROM ..."
              value={tileSql}
              onChange={(e) => setTileSql(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <label className="muted" style={{ fontSize: 11 }}>
                Type:
              </label>
              <select
                value={tileType}
                onChange={(e) => setTileType(e.target.value)}
                style={{ width: "auto", flex: "0 0 auto" }}
              >
                {TILE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button
                className="primary"
                style={{ marginTop: 0 }}
                disabled={!tileTitle.trim() || !tileSql.trim()}
                onClick={addTile}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="dash-grid">
        {activeTiles.length === 0 ? (
          <div className="dash-empty">
            {activeId ? "No tiles yet. Click + Add tile." : "Pick a dashboard to view tiles."}
          </div>
        ) : (
          activeTiles.map((t) => <TileView key={t.id} tile={t} onDelete={deleteTile} />)
        )}
      </div>

      <Modal
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="New dashboard"
        footer={
          <>
            <button className="ghost" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </button>
            <button
              className="primary"
              style={{ marginTop: 0 }}
              onClick={confirmCreateDashboard}
              disabled={!newDashName.trim()}
            >
              Create
            </button>
          </>
        }
      >
        <label className="lbl">Name</label>
        <input
          value={newDashName}
          onChange={(e) => setNewDashName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmCreateDashboard();
          }}
          placeholder="Q4 KPIs"
        />
      </Modal>
    </>
  );
}

function TileView({ tile, onDelete }: { tile: Tile; onDelete: (id: string) => void }) {
  const [data, setData] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    runSql(tile.sql)
      .then(setData)
      .catch((e) => setError(e?.message ?? String(e)));
  }, [tile.sql]);

  return (
    <div className="dash-tile">
      <h4>{tile.title}</h4>
      <div className="tile-actions">
        <button className="ghost tiny danger" onClick={() => onDelete(tile.id)}>
          ×
        </button>
      </div>
      {error && (
        <div style={{ color: "var(--err)", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
          {error}
        </div>
      )}
      {!error && !data && <div className="muted">Loading…</div>}
      {data && <TileBody tile={tile} data={data} />}
    </div>
  );
}

function TileBody({ tile, data }: { tile: Tile; data: SqlResult }) {
  if (data.rows.length === 0) return <div className="muted">No rows.</div>;

  if (tile.chartType === "big_number") {
    const first = data.rows[0];
    const value = Number(Object.values(first)[0]);
    return (
      <>
        <div className="big-number">{Number.isFinite(value) ? value.toLocaleString() : "—"}</div>
        <div className="big-number-label">{data.columns[0]}</div>
      </>
    );
  }

  if (tile.chartType === "table") {
    return (
      <div className="db-scroll" style={{ maxHeight: 220 }}>
        <table className="db-table">
          <thead>
            <tr>
              {data.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 50).map((r, i) => (
              <tr key={i}>
                {data.columns.map((c) => (
                  <td key={c}>{String(r[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Chart variants — first column = labels, remaining numeric columns = series
  const labels = data.rows.map((r) => String(r[data.columns[0]]));
  const seriesCols = data.columns.slice(1);
  const datasets = seriesCols.map((c) => ({
    label: c,
    data: data.rows.map((r) => Number(r[c]) || 0),
  }));
  return (
    <RealChart
      spec={{
        type: tile.chartType as "bar" | "line" | "pie" | "doughnut" | "scatter",
        labels,
        datasets,
      }}
      height={180}
    />
  );
}

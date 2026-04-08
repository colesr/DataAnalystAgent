"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  sourceFile: string | null;
  columns: { name: string; type: string }[];
  rowCount: number;
  createdAt: string;
};

type RowsResponse = {
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
};

type SqlResponse = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

type ChartSpec = {
  type: "bar" | "line" | "pie" | "doughnut" | "scatter";
  title: string;
  labels: (string | number)[];
  datasets: { label: string; data: number[] }[];
};

type AgentEvent =
  | { type: "start"; model: string }
  | { type: "text"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output?: unknown; error?: string }
  | { type: "chart"; spec: ChartSpec }
  | { type: "done"; reason: string }
  | { type: "error"; message: string };

type Toast = { id: number; kind: "info" | "success" | "err"; text: string };

type TabId =
  | "ask"
  | "data"
  | "tools"
  | "dashboard"
  | "clean"
  | "pivot"
  | "sql"
  | "glossary"
  | "saved"
  | "schema";

type Cat =
  | "all"
  | "profile"
  | "aggregate"
  | "stats"
  | "modeling"
  | "analytics"
  | "engineering"
  | "quality"
  | "viz";

const TABS: { id: TabId; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "data", label: "Data" },
  { id: "tools", label: "Tools" },
  { id: "dashboard", label: "Dashboard" },
  { id: "clean", label: "Clean" },
  { id: "pivot", label: "Pivot" },
  { id: "sql", label: "SQL" },
  { id: "glossary", label: "Glossary" },
  { id: "saved", label: "Saved" },
  { id: "schema", label: "Schema" },
];

const CATS: { id: Cat; label: string }[] = [
  { id: "all", label: "All" },
  { id: "profile", label: "Profile" },
  { id: "aggregate", label: "Aggregate" },
  { id: "stats", label: "Statistics" },
  { id: "modeling", label: "Modeling" },
  { id: "analytics", label: "Analytics" },
  { id: "engineering", label: "Engineering" },
  { id: "quality", label: "Quality" },
  { id: "viz", label: "Visualization" },
];

export default function Page() {
  const [tab, setTab] = useState<TabId>("ask");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [soundOn, setSoundOn] = useState(true);
  const [activeCat, setActiveCat] = useState<Cat>("all");
  const [botOpen, setBotOpen] = useState(false);

  // Datasets / data plane
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedDsId, setSelectedDsId] = useState<string | null>(null);
  const [rowsData, setRowsData] = useState<RowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SQL editor
  const [sqlText, setSqlText] = useState("");
  const [sqlResult, setSqlResult] = useState<SqlResponse | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  // Agent / Ask
  const [model, setModel] = useState("gemini:gemini-2.5-flash");
  const [question, setQuestion] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [agentText, setAgentText] = useState("");
  const [agentCharts, setAgentCharts] = useState<ChartSpec[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastIdRef.current;
    setToasts((ts) => [...ts, { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ---- API helpers ----
  const fetchDatasets = useCallback(async () => {
    try {
      const res = await fetch("/api/datasets", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { datasets: DatasetMeta[] } = await res.json();
      setDatasets(data.datasets);
      // If the currently selected dataset disappeared, deselect it.
      if (selectedDsId && !data.datasets.find((d) => d.id === selectedDsId)) {
        setSelectedDsId(null);
        setRowsData(null);
      }
    } catch (e: any) {
      toast("err", `Failed to load datasets: ${e?.message ?? e}`);
    }
  }, [selectedDsId, toast]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const fetchRows = useCallback(
    async (id: string, pageArg: number, sortArg: string | null, dirArg: "asc" | "desc", q: string) => {
      setRowsLoading(true);
      try {
        const url = new URL(`/api/datasets/${id}/rows`, window.location.origin);
        url.searchParams.set("page", String(pageArg));
        url.searchParams.set("pageSize", String(pageSize));
        if (sortArg) {
          url.searchParams.set("sort", sortArg);
          url.searchParams.set("dir", dirArg);
        }
        if (q) url.searchParams.set("q", q);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const data: RowsResponse = await res.json();
        setRowsData(data);
      } catch (e: any) {
        toast("err", `Failed to load rows: ${e?.message ?? e}`);
        setRowsData(null);
      } finally {
        setRowsLoading(false);
      }
    },
    [pageSize, toast]
  );

  // Re-fetch rows whenever the selected dataset / page / sort / filter changes.
  useEffect(() => {
    if (!selectedDsId) return;
    fetchRows(selectedDsId, page, sortCol, sortDir, filter);
  }, [selectedDsId, page, sortCol, sortDir, filter, fetchRows]);

  const onSelectDataset = useCallback((id: string) => {
    setSelectedDsId(id);
    setPage(0);
    setSortCol(null);
    setFilter("");
    setRowsData(null);
  }, []);

  const onSortColumn = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortCol]
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      try {
        for (const f of Array.from(files)) {
          const fd = new FormData();
          fd.append("file", f);
          const res = await fetch("/api/datasets/upload", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast("err", `${f.name}: ${data.error ?? `HTTP ${res.status}`}`);
            continue;
          }
          toast("success", `Loaded ${f.name} → ${data.tableName} (${data.rowCount} rows)`);
        }
        await fetchDatasets();
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [fetchDatasets, toast]
  );

  const deleteDataset = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Delete dataset "${name}"? This drops the underlying table.`)) return;
      try {
        const res = await fetch(`/api/datasets/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast("success", `Deleted ${name}`);
        if (selectedDsId === id) {
          setSelectedDsId(null);
          setRowsData(null);
        }
        await fetchDatasets();
      } catch (e: any) {
        toast("err", `Delete failed: ${e?.message ?? e}`);
      }
    },
    [fetchDatasets, selectedDsId, toast]
  );

  const clearAllDatasets = useCallback(async () => {
    if (datasets.length === 0) return;
    if (!confirm(`Delete all ${datasets.length} datasets? This drops their tables.`)) return;
    try {
      for (const d of datasets) {
        await fetch(`/api/datasets/${d.id}`, { method: "DELETE" });
      }
      setSelectedDsId(null);
      setRowsData(null);
      await fetchDatasets();
      toast("success", "All datasets cleared");
    } catch (e: any) {
      toast("err", `Clear failed: ${e?.message ?? e}`);
    }
  }, [datasets, fetchDatasets, toast]);

  const runAgent = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setAgentRunning(true);
    setAgentEvents([]);
    setAgentText("");
    setAgentCharts([]);
    setAgentError(null);

    const ctrl = new AbortController();
    agentAbortRef.current = ctrl;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, model }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const json = part.slice(6).trim();
          if (!json) continue;
          let ev: AgentEvent;
          try {
            ev = JSON.parse(json) as AgentEvent;
          } catch {
            continue;
          }
          // Append the event so the trace UI re-renders.
          setAgentEvents((prev) => [...prev, ev]);
          if (ev.type === "text") {
            setAgentText((prev) => prev + ev.delta);
          } else if (ev.type === "chart") {
            setAgentCharts((prev) => [...prev, ev.spec]);
          } else if (ev.type === "error") {
            setAgentError(ev.message);
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setAgentError(e?.message ?? String(e));
      }
    } finally {
      setAgentRunning(false);
      agentAbortRef.current = null;
    }
  }, [question, model]);

  const stopAgent = useCallback(() => {
    agentAbortRef.current?.abort();
  }, []);

  const runSql = useCallback(async () => {
    if (!sqlText.trim()) return;
    setSqlRunning(true);
    setSqlError(null);
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlText, source: "editor" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSqlError(data.error ?? `HTTP ${res.status}`);
        setSqlResult(null);
        return;
      }
      setSqlResult(data);
      toast(
        "success",
        `${data.rowCount} row${data.rowCount === 1 ? "" : "s"} in ${data.durationMs}ms${
          data.truncated ? " (truncated)" : ""
        }`
      );
    } catch (e: any) {
      setSqlError(e?.message ?? String(e));
      setSqlResult(null);
    } finally {
      setSqlRunning(false);
    }
  }, [sqlText, toast]);

  const noop = () => {};

  return (
    <>
      <div className="container">
        <header>
          <h1>Digital Data Analyst</h1>
          <div className="header-actions">
            <button
              className="icon-btn"
              title="Toggle theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? "☾" : "☀"}
            </button>
            <button
              className={`icon-btn ${soundOn ? "active" : ""}`}
              title="Toggle sound"
              onClick={() => setSoundOn((s) => !s)}
            >
              ♪
            </button>
            <a
              className="icon-btn"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              title="Get free API key"
            >
              ⚷
            </a>
          </div>
        </header>

        {/* Model card */}
        <div className="card">
          <h3>Model</h3>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gemini:gemini-2.5-flash">Gemini 2.5 Flash — free</option>
            <option value="claude:claude-sonnet-4-6">Claude Sonnet 4.6 — balanced</option>
            <option value="claude:claude-opus-4-6">Claude Opus 4.6 — most capable</option>
            <option value="claude:claude-haiku-4-5-20251001">Claude Haiku 4.5 — fastest</option>
          </select>
          <div className="muted" style={{ marginTop: 6 }}>
            Server-side keys. No BYOK in this build.
          </div>
        </div>

        {/* Data card */}
        <div className="card">
          <h3>
            Data
            <span className="right">
              <button className="ghost tiny danger" onClick={clearAllDatasets} disabled={!datasets.length}>
                Clear
              </button>
            </span>
          </h3>
          <label className="upload-zone">
            {uploading ? "Uploading…" : "Drop a CSV / Excel file or click to browse"}
            <div className="muted" style={{ marginTop: 4 }}>
              Files append as new tables — load several to join across them
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xls,.xlsx"
              multiple
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadFiles(e.target.files);
                }
              }}
            />
          </label>
          <div className="muted" style={{ marginTop: 8 }}>
            {datasets.length === 0
              ? "(no files loaded)"
              : `${datasets.length} table${datasets.length === 1 ? "" : "s"} · ${datasets
                  .reduce((a, d) => a + d.rowCount, 0)
                  .toLocaleString()} rows total`}
          </div>
        </div>

        {/* Tabs */}
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ============ ASK ============ */}
        <section className="tab-panel" hidden={tab !== "ask"}>
          <div className="card">
            <h3>
              Question
              <span className="right">
                <button
                  className="ghost tiny"
                  disabled={agentRunning}
                  onClick={() => {
                    setQuestion("");
                    setAgentEvents([]);
                    setAgentText("");
                    setAgentCharts([]);
                    setAgentError(null);
                  }}
                >
                  New conversation
                </button>
              </span>
            </h3>
            <textarea
              placeholder="e.g. Why did our retail margins drop in the Boston suburbs last month?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (!agentRunning) runAgent();
                }
              }}
              rows={3}
            />
            {datasets.length === 0 && (
              <div className="muted" style={{ marginTop: 6 }}>
                Tip: upload a CSV/Excel file above so the agent has data to analyze.
              </div>
            )}
            <div style={{ marginTop: 6 }} />
            {!agentRunning ? (
              <button
                className="primary"
                onClick={runAgent}
                disabled={!question.trim()}
              >
                Run analysis
              </button>
            ) : (
              <button className="primary" onClick={stopAgent}>
                <span className="spinner" /> Stop
              </button>
            )}
            <span className="muted" style={{ marginLeft: 8 }}>
              ⌘/Ctrl+Enter
            </span>
          </div>

          {/* Trace of tool calls + thinking */}
          {(agentEvents.length > 0 || agentRunning) && (
            <div className="card">
              <h3>Trace</h3>
              {agentEvents
                .filter((e) => e.type === "tool_use" || e.type === "tool_result" || e.type === "error")
                .map((e, i) => {
                  if (e.type === "tool_use") {
                    return (
                      <div key={i} className={`trace-step tool-${e.name === "query_sql" ? "sql" : ""}`}>
                        <div className="label">
                          <span className="tag">{e.name}</span>
                          <span>tool call</span>
                        </div>
                        <pre>{JSON.stringify(e.input, null, 2)}</pre>
                      </div>
                    );
                  }
                  if (e.type === "tool_result") {
                    const isErr = e.error != null;
                    return (
                      <div key={i} className={`trace-step ${isErr ? "err" : ""}`}>
                        <div className="label">
                          <span className="tag">{e.name}</span>
                          <span>{isErr ? "error" : "result"}</span>
                        </div>
                        <pre>
                          {isErr
                            ? e.error
                            : JSON.stringify(e.output, null, 2).slice(0, 4000)}
                        </pre>
                      </div>
                    );
                  }
                  if (e.type === "error") {
                    return (
                      <div key={i} className="trace-step err">
                        <div className="label">
                          <span className="tag">error</span>
                        </div>
                        <pre>{e.message}</pre>
                      </div>
                    );
                  }
                  return null;
                })}
              {agentRunning && (
                <div className="muted" style={{ marginTop: 8 }}>
                  <span className="thinking-pulse" />
                  <span className="thinking-pulse" />
                  <span className="thinking-pulse" />{" "}
                  thinking…
                </div>
              )}
            </div>
          )}

          {/* Final report — markdown text + collected charts */}
          {(agentText || agentCharts.length > 0) && (
            <div id="report" className="card">
              <h3>Final Report</h3>
              {agentText && (
                <div
                  id="summary"
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  {agentText}
                </div>
              )}
              {agentCharts.length > 0 && (
                <>
                  <h4>Charts</h4>
                  <div className="charts-grid">
                    {agentCharts.map((c, i) => (
                      <ChartPreview key={i} spec={c} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {agentError && (
            <div className="card" style={{ borderColor: "var(--err)" }}>
              <h3 style={{ color: "var(--err)" }}>Error</h3>
              <pre style={{ whiteSpace: "pre-wrap" }}>{agentError}</pre>
            </div>
          )}
        </section>

        {/* ============ DATA BROWSER ============ */}
        <section className="tab-panel" hidden={tab !== "data"}>
          <div className="card">
            <h3>
              Datasets{" "}
              <span className="badge">
                {datasets.length} table{datasets.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="muted" style={{ marginBottom: 8 }}>
              Pick a table to browse its rows. Click column headers to sort.
            </div>
            <div className="db-layout">
              <div className="db-tables">
                {datasets.length === 0 ? (
                  <div className="muted">
                    No datasets loaded. Drop a CSV/Excel file at the top.
                  </div>
                ) : (
                  datasets.map((d) => (
                    <button
                      key={d.id}
                      className={`db-tbl-item ${selectedDsId === d.id ? "active" : ""}`}
                      onClick={() => onSelectDataset(d.id)}
                    >
                      <div className="db-tbl-name">{d.name}</div>
                      <div className="db-tbl-meta">
                        {d.rowCount.toLocaleString()} rows · {d.columns.length} cols
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="db-main">
                <div className="db-toolbar">
                  <input
                    type="search"
                    placeholder="Filter rows…"
                    disabled={!selectedDsId}
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPage(0);
                    }}
                  />
                  <span className="db-info">
                    {rowsData
                      ? `${rowsData.total.toLocaleString()} row${
                          rowsData.total === 1 ? "" : "s"
                        } · page ${page + 1}/${Math.max(1, Math.ceil(rowsData.total / pageSize))}`
                      : ""}
                  </span>
                  <span className="db-pager">
                    <button
                      className="ghost"
                      disabled={!rowsData || page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      ‹ Prev
                    </button>
                    <button
                      className="ghost"
                      disabled={
                        !rowsData || (page + 1) * pageSize >= (rowsData?.total ?? 0)
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next ›
                    </button>
                    {selectedDsId && (
                      <button
                        className="ghost danger"
                        onClick={() => {
                          const ds = datasets.find((d) => d.id === selectedDsId);
                          if (ds) deleteDataset(ds.id, ds.name);
                        }}
                      >
                        Drop
                      </button>
                    )}
                  </span>
                </div>
                <div className="db-scroll">
                  {!selectedDsId ? (
                    <div className="muted" style={{ padding: 16 }}>
                      Select a dataset on the left.
                    </div>
                  ) : rowsLoading ? (
                    <div className="muted" style={{ padding: 16 }}>
                      Loading…
                    </div>
                  ) : !rowsData || rowsData.rows.length === 0 ? (
                    <div className="muted" style={{ padding: 16 }}>
                      No rows.
                    </div>
                  ) : (
                    <table className="db-table">
                      <thead>
                        <tr>
                          {rowsData.columns.map((c) => (
                            <th key={c.name} onClick={() => onSortColumn(c.name)}>
                              {c.name}
                              {sortCol === c.name && (sortDir === "asc" ? " ↑" : " ↓")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsData.rows.map((r, i) => (
                          <tr key={i}>
                            {rowsData.columns.map((c) => (
                              <td key={c.name}>{formatCell(r[c.name])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ TOOLS ============ */}
        <section className="tab-panel" hidden={tab !== "tools"}>
          <div className="tool-toolbar">
            <input type="search" placeholder="Search tools…" />
            <div className="cat-chips">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${activeCat === c.id ? "active" : ""}`}
                  onClick={() => setActiveCat(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <ToolCard title="Distribution / Histogram" hint="Or click any column in the Schema tab.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Column"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>View distribution</button>
          </ToolCard>

          <ToolCard title="Correlation Matrix" hint="Pearson correlations between numeric columns.">
            <Row>
              <Field label="Table"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Compute correlations</button>
            <div className="tool-result" />
          </ToolCard>

          <ToolCard title="Forecast" hint="Aggregate by date and project a linear trend N periods forward.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Date col"><select /></Field>
              <Field label="Value col"><select /></Field>
              <Field label="Aggregate">
                <select>
                  <option>SUM</option>
                  <option>AVG</option>
                  <option>COUNT</option>
                </select>
              </Field>
              <Field label="Periods">
                <input type="number" defaultValue={14} min={1} max={365} />
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Forecast</button>
          </ToolCard>

          <ToolCard title="Outlier Detection (IQR)" hint="Flag rows where the column is outside Q1−1.5·IQR or Q3+1.5·IQR.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Column"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Find outliers</button>
          </ToolCard>

          <ToolCard title="Period-over-Period" hint="Bucket a metric by time period and compute lift between periods.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Date col"><select /></Field>
              <Field label="Value col"><select /></Field>
              <Field label="Aggregate">
                <select>
                  <option>SUM</option>
                  <option>AVG</option>
                  <option>COUNT</option>
                </select>
              </Field>
              <Field label="Period">
                <select defaultValue="month">
                  <option>day</option>
                  <option>week</option>
                  <option value="month">month</option>
                  <option>quarter</option>
                  <option>year</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Compare</button>
          </ToolCard>

          <ToolCard title="Group-by Builder" hint="Quick aggregation without writing SQL.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Group by"><select /></Field>
              <Field label="Value"><select /></Field>
              <Field label="Aggregate">
                <select>
                  <option>SUM</option>
                  <option>AVG</option>
                  <option>COUNT</option>
                  <option>MIN</option>
                  <option>MAX</option>
                </select>
              </Field>
              <Field label="Order">
                <select>
                  <option value="DESC">↓ Desc</option>
                  <option value="ASC">↑ Asc</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Run</button>
          </ToolCard>

          <ToolCard title="Two-Sample T-Test" hint="Compare means of a numeric column between two groups in a categorical column.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Group col"><select /></Field>
              <Field label="Value col"><select /></Field>
            </Row>
            <Row>
              <Field label="Group A"><select /></Field>
              <Field label="Group B"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Run t-test</button>
          </ToolCard>

          <ToolCard title="Join Tables" hint="Visual join builder. Preview, then save the result as a new table.">
            <Row>
              <Field label="Left table"><select /></Field>
              <Field label="Left key"><select /></Field>
              <Field label="Type">
                <select>
                  <option>INNER</option>
                  <option>LEFT</option>
                  <option>RIGHT</option>
                </select>
              </Field>
              <Field label="Right table"><select /></Field>
              <Field label="Right key"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Preview join</button>
            <button className="ghost" style={{ marginLeft: 6 }} onClick={noop}>
              Save as table
            </button>
          </ToolCard>

          <ToolCard title="Cohort Retention" hint="Group users by signup period and track retention over time.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="User ID"><select /></Field>
              <Field label="Signup date"><select /></Field>
              <Field label="Activity date"><select /></Field>
              <Field label="Period">
                <select defaultValue="month">
                  <option>week</option>
                  <option value="month">month</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Compute retention</button>
          </ToolCard>

          <ToolCard title="Linear Regression" hint="OLS fit. Returns coefficients, R², and a scatter + fit line chart.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="y (dependent)"><select /></Field>
              <Field label="x (independent)"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Fit</button>
          </ToolCard>

          <ToolCard title="Pareto / 80-20" hint="Sort categories by metric and find the top contributors driving 80% of total.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Category"><select /></Field>
              <Field label="Value"><select /></Field>
              <Field label="Aggregate">
                <select>
                  <option>SUM</option>
                  <option>COUNT</option>
                  <option>AVG</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Build Pareto</button>
          </ToolCard>

          <ToolCard title="A/B Test Sample Size" hint="Required sample size per variant for a two-proportion z-test.">
            <Row>
              <Field label="Baseline (%)"><input type="number" defaultValue={10} step={0.1} /></Field>
              <Field label="MDE (% abs)"><input type="number" defaultValue={2} step={0.1} /></Field>
              <Field label="Confidence (%)"><input type="number" defaultValue={95} /></Field>
              <Field label="Power (%)"><input type="number" defaultValue={80} /></Field>
            </Row>
            <button className="primary" onClick={noop}>Calculate</button>
          </ToolCard>

          <ToolCard title="Funnel Analysis" hint="Conversion through ordered steps. Each step is a value in the event column.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="User col"><select /></Field>
              <Field label="Event col"><select /></Field>
            </Row>
            <div style={{ marginTop: 8 }}>
              <label className="lbl">Steps (one per line, in order)</label>
              <textarea className="code" placeholder={"visit\nsignup\npurchase"} />
            </div>
            <button className="primary" onClick={noop}>Compute funnel</button>
          </ToolCard>

          <ToolCard title="Window Functions" hint="Generate window function SQL without writing it.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Function">
                <select>
                  <option>ROW_NUMBER</option>
                  <option>RANK</option>
                  <option>DENSE_RANK</option>
                  <option>LAG</option>
                  <option>LEAD</option>
                  <option>SUM (running)</option>
                  <option>AVG (running)</option>
                </select>
              </Field>
              <Field label="Value col"><select /></Field>
              <Field label="Partition by"><select /></Field>
              <Field label="Order by"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Run</button>
          </ToolCard>

          <ToolCard title="Quantile Bucketing" hint="Bin a numeric column into N equal-frequency buckets and add the result as a new column.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Column"><select /></Field>
              <Field label="Buckets">
                <select defaultValue="10">
                  <option>4</option>
                  <option value="10">10</option>
                  <option>20</option>
                  <option>100</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Add bucket column</button>
          </ToolCard>

          <ToolCard title="Normalize Column" hint="Add a standardized version of a numeric column.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Column"><select /></Field>
              <Field label="Method">
                <select>
                  <option>z-score</option>
                  <option>min-max (0-1)</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Add normalized column</button>
          </ToolCard>

          <ToolCard title="Geographic Map" hint="Plot points from a table with latitude/longitude columns.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Latitude"><select /></Field>
              <Field label="Longitude"><select /></Field>
              <Field label="Label"><select /></Field>
              <Field label="Size by (optional)"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Render map</button>
          </ToolCard>

          <ToolCard title="Sankey Flow Diagram" hint="Visualize flows between source and target categories.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Source"><select /></Field>
              <Field label="Target"><select /></Field>
              <Field label="Value (optional)"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Build Sankey</button>
          </ToolCard>

          <ToolCard
            title="Survival Curve (Kaplan-Meier)"
            hint="Estimate survival probability over time. Time = duration observed, Event = 1 if churned/died, 0 if censored."
          >
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Time col"><select /></Field>
              <Field label="Event col (1/0)"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Compute</button>
          </ToolCard>

          <ToolCard title="Multi-variable Regression" hint="OLS with multiple X columns. Returns coefficients and R².">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="y (dependent)"><select /></Field>
            </Row>
            <div style={{ marginTop: 8 }}>
              <label className="lbl">X columns (Ctrl/Cmd-click for multiple)</label>
              <select multiple size={6} />
            </div>
            <button className="primary" onClick={noop}>Fit</button>
          </ToolCard>

          <ToolCard title="Chi-Squared Test" hint="Test independence between two categorical columns.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Column A"><select /></Field>
              <Field label="Column B"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Run test</button>
          </ToolCard>

          <div className="card">
            <h3>
              Data Dictionary
              <span className="right">
                <button className="ghost tiny" onClick={noop}>Export MD</button>
                <button className="ghost tiny" onClick={noop}>Export CSV</button>
              </span>
            </h3>
            <div className="muted">
              Auto-generated documentation of every column. Inline notes are saved to localStorage.
            </div>
            <button className="primary" onClick={noop}>Build dictionary</button>
          </div>

          <div className="tools-divider">Data Engineering</div>

          <ToolCard
            title="Date Dimensions"
            hint="Explode a date column into year, quarter, month, week, day-of-week, day-of-month, day-of-year, is_weekend."
          >
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Date column"><select /></Field>
            </Row>
            <button className="primary" onClick={noop}>Add date columns</button>
          </ToolCard>

          <ToolCard
            title="Sessionization"
            hint="Group events into sessions by user. New session when the gap between events exceeds N minutes."
          >
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="User col"><select /></Field>
              <Field label="Timestamp col"><select /></Field>
              <Field label="Idle gap (min)">
                <input type="number" defaultValue={30} min={1} />
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Add session_id</button>
          </ToolCard>

          <ToolCard title="Rolling Window" hint="Add a rolling-window aggregate column (e.g. 7-day moving average).">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Value col"><select /></Field>
              <Field label="Order by"><select /></Field>
              <Field label="Function">
                <select>
                  <option>AVG</option>
                  <option>SUM</option>
                  <option>MIN</option>
                  <option>MAX</option>
                </select>
              </Field>
              <Field label="Window size">
                <input type="number" defaultValue={7} min={2} />
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Add rolling column</button>
          </ToolCard>

          <ToolCard
            title="K-means Clustering"
            hint="Cluster rows into K groups based on selected numeric columns. Adds cluster_id column. Features are z-scored."
          >
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="K (clusters)">
                <input type="number" defaultValue={3} min={2} max={20} />
              </Field>
            </Row>
            <div style={{ marginTop: 8 }}>
              <label className="lbl">Features (Ctrl/Cmd-click for multiple)</label>
              <select multiple size={6} />
            </div>
            <button className="primary" onClick={noop}>Cluster</button>
          </ToolCard>

          <div className="tools-divider">Quality</div>

          <div className="card">
            <h3>Data Assertions</h3>
            <div className="muted">
              Each line: <code>description | SQL that should return 0 rows</code>. Saved to
              localStorage. Run any time to validate the data.
            </div>
            <textarea
              className="code"
              placeholder={
                "No negative revenue | SELECT * FROM sales WHERE revenue < 0\n" +
                "Every store has a region | SELECT * FROM stores WHERE region IS NULL\n" +
                "Cost never exceeds revenue | SELECT * FROM sales WHERE cost > revenue"
              }
            />
            <button className="primary" onClick={noop}>Run assertions</button>
          </div>

          <div className="tools-divider">Visualization</div>

          <ToolCard title="Treemap" hint="Hierarchical area chart. Each rectangle's size is proportional to the metric.">
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Category"><select /></Field>
              <Field label="Value"><select /></Field>
              <Field label="Aggregate">
                <select>
                  <option>SUM</option>
                  <option>COUNT</option>
                  <option>AVG</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Build treemap</button>
          </ToolCard>
        </section>

        {/* ============ DASHBOARD ============ */}
        <section className="tab-panel" hidden={tab !== "dashboard"}>
          <div className="card">
            <h3>
              Dashboard
              <span className="right">
                <button className="ghost tiny" onClick={noop}>+ Add tile</button>
              </span>
            </h3>
            <div className="dash-toolbar">
              <select />
              <input placeholder="Dashboard name" style={{ flex: 1 }} />
              <button className="ghost tiny" onClick={noop}>+ New</button>
              <button className="ghost tiny" onClick={noop}>Save</button>
              <button className="ghost tiny danger" onClick={noop}>Delete</button>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Combine SQL queries into a custom dashboard. Tiles support bar / line / pie /
              doughnut / big number / table / treemap. All data stays in your browser.
            </div>
          </div>
          <div className="dash-grid">
            <div className="dash-empty">No tiles yet. Click + Add tile to start.</div>
          </div>
        </section>

        {/* ============ CLEAN ============ */}
        <section className="tab-panel" hidden={tab !== "clean"}>
          <div className="card">
            <h3>Clean & Transform</h3>
            <div className="muted" style={{ marginBottom: 10 }}>
              Operations apply immediately. Re-uploading resets.
            </div>
            <select style={{ marginBottom: 12 }} />
            <div className="muted">No tables loaded.</div>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="ghost" onClick={noop}>Remove duplicate rows</button>
              <button className="ghost" onClick={noop}>Add calculated column</button>
              <button className="ghost" onClick={noop}>Auto-parse dates</button>
              <button className="ghost danger" onClick={noop}>Drop table</button>
            </div>
          </div>
        </section>

        {/* ============ PIVOT ============ */}
        <section className="tab-panel" hidden={tab !== "pivot"}>
          <div className="card">
            <h3>Pivot Table Builder</h3>
            <Row>
              <Field label="Table"><select /></Field>
              <Field label="Rows"><select /></Field>
              <Field label="Columns (optional)"><select /></Field>
              <Field label="Values"><select /></Field>
              <Field label="Aggregate">
                <select>
                  <option>SUM</option>
                  <option>AVG</option>
                  <option>COUNT</option>
                  <option>MIN</option>
                  <option>MAX</option>
                </select>
              </Field>
            </Row>
            <button className="primary" onClick={noop}>Build pivot</button>
            <label
              style={{
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginLeft: 10,
                color: "var(--muted)",
              }}
            >
              <input
                type="checkbox"
                defaultChecked
                style={{ width: "auto", margin: 0 }}
              />{" "}
              heatmap cells
            </label>
            <div className="tool-result" />
          </div>
        </section>

        {/* ============ SQL ============ */}
        <section className="tab-panel" hidden={tab !== "sql"}>
          <div className="card">
            <h3>
              SQL Editor
              <span className="right">
                <span className="muted">
                  {datasets.length === 0
                    ? "no tables yet"
                    : `${datasets.length} table${datasets.length === 1 ? "" : "s"} available`}
                </span>
              </span>
            </h3>
            <textarea
              className="code"
              placeholder={
                datasets[0]
                  ? `SELECT * FROM ${datasets[0].tableName} LIMIT 50;`
                  : "SELECT * FROM ... LIMIT 50;"
              }
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              rows={6}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  runSql();
                }
              }}
            />
            <button className="primary" onClick={runSql} disabled={sqlRunning || !sqlText.trim()}>
              {sqlRunning ? "Running…" : "Run query"}
            </button>
            <span className="muted" style={{ marginLeft: 8 }}>
              ⌘/Ctrl+Enter
            </span>
            <div className="tool-result">
              {sqlError && (
                <div
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--err)",
                    borderRadius: 4,
                    padding: 10,
                    color: "var(--err)",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {sqlError}
                </div>
              )}
              {sqlResult && !sqlError && (
                <>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    {sqlResult.rowCount} row{sqlResult.rowCount === 1 ? "" : "s"} ·{" "}
                    {sqlResult.durationMs}ms
                    {sqlResult.truncated && ` · truncated to ${sqlResult.rows.length}`}
                  </div>
                  <div className="db-scroll">
                    {sqlResult.rows.length === 0 ? (
                      <div className="muted" style={{ padding: 16 }}>
                        Query returned no rows.
                      </div>
                    ) : (
                      <table className="db-table">
                        <thead>
                          <tr>
                            {sqlResult.columns.map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sqlResult.rows.map((r, i) => (
                            <tr key={i}>
                              {sqlResult.columns.map((c) => (
                                <td key={c}>{formatCell(r[c])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="card">
            <h3>
              Tables in this workspace <span className="badge">{datasets.length}</span>
            </h3>
            {datasets.length === 0 ? (
              <div className="muted">Upload a CSV to get started.</div>
            ) : (
              <div>
                {datasets.map((d) => (
                  <div key={d.id} className="qh-row">
                    <span className="qh-source">table</span>
                    <span className="qh-sql">
                      {d.tableName} ({d.columns.map((c) => `${c.name} ${c.type}`).join(", ")})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ============ GLOSSARY ============ */}
        <section className="tab-panel" hidden={tab !== "glossary"}>
          <div className="card">
            <h3>Metric Glossary</h3>
            <div className="muted" style={{ marginBottom: 8 }}>
              One per line: <code>name: definition</code>. Injected into the agent&apos;s system
              prompt.
            </div>
            <textarea
              className="code"
              placeholder={
                "active_user: customer with at least one purchase in the last 30 days\n" +
                "margin_rate: (revenue - cost) / revenue\n" +
                "fiscal_year: starts February 1\n" +
                "last_month: the most recent fully completed calendar month"
              }
            />
            <button className="primary" onClick={noop}>Save glossary</button>
          </div>
        </section>

        {/* ============ SAVED ============ */}
        <section className="tab-panel" hidden={tab !== "saved"}>
          <div className="card">
            <h3>Saved Analyses</h3>
            <div className="muted" style={{ marginBottom: 8 }}>
              Click load to restore. Re-run to apply to current data.
            </div>
            <div>
              <div className="muted">No saved analyses yet.</div>
            </div>
          </div>
        </section>

        {/* ============ SCHEMA ============ */}
        <section className="tab-panel" hidden={tab !== "schema"}>
          <div className="card">
            <h3>
              Data Profile <span className="badge">0 columns</span>
            </h3>
            <div className="muted" style={{ marginBottom: 8 }}>
              Click any column to see its distribution.
            </div>
            <div className="profile-grid" />
          </div>
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
              (no tables loaded)
            </pre>
          </div>
        </section>
      </div>

      {/* ============ TOASTS ============ */}
      {toasts.map((t, i) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          style={{ top: 20 + i * 52 }}
        >
          {t.text}
        </div>
      ))}

      {/* ============ CHATBOT FAB + PANEL ============ */}
      <button
        className={`bot-fab ${botOpen ? "active" : ""}`}
        title="Help"
        onClick={() => setBotOpen((b) => !b)}
      >
        ?
      </button>
      {botOpen && (
        <div className="bot-panel">
          <div className="bot-header">
            <span className="bot-title">Help · Digital Data Analyst</span>
            <button className="close" onClick={() => setBotOpen(false)}>
              ×
            </button>
          </div>
          <div className="bot-msgs">
            <div className="bot-msg bot">
              Hi! I&apos;m the in-app helper. I can answer questions about how to use this app
              once Phase 3 wires the backend.
            </div>
          </div>
          <div className="bot-suggestions">
            <button onClick={noop}>How do I upload data?</button>
            <button onClick={noop}>What can the Tools tab do?</button>
            <button onClick={noop}>How does the agent work?</button>
          </div>
          <div className="bot-input-row">
            <input type="text" placeholder="Ask anything about the app…" />
            <button onClick={noop}>→</button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------- */
/* Small layout helpers                                */
/* -------------------------------------------------- */

function ChartPreview({ spec }: { spec: ChartSpec }) {
  // Lightweight preview — single dataset bar/line as inline SVG, anything
  // more elaborate falls back to a value table. Real Chart.js rendering
  // can land in a later phase.
  const ds = spec.datasets[0];
  const isBarLike = (spec.type === "bar" || spec.type === "line") && ds && ds.data.length > 0;
  if (isBarLike) {
    const max = Math.max(...ds.data, 0);
    const min = Math.min(...ds.data, 0);
    const range = max - min || 1;
    const W = 320;
    const H = 120;
    const padX = 8;
    const padY = 8;
    const barW = (W - padX * 2) / ds.data.length;
    return (
      <div className="chart-wrap" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
          {spec.title}
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {spec.type === "bar"
            ? ds.data.map((v, i) => {
                const h = ((v - min) / range) * (H - padY * 2);
                return (
                  <rect
                    key={i}
                    x={padX + i * barW + 1}
                    y={H - padY - h}
                    width={Math.max(1, barW - 2)}
                    height={h}
                    fill="var(--accent)"
                  />
                );
              })
            : (() => {
                const pts = ds.data
                  .map(
                    (v, i) =>
                      `${padX + i * barW + barW / 2},${
                        H - padY - ((v - min) / range) * (H - padY * 2)
                      }`
                  )
                  .join(" ");
                return (
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                  />
                );
              })()}
        </svg>
        <div className="muted" style={{ marginTop: 4, fontSize: 10 }}>
          {spec.type} · {ds.label} · {ds.data.length} pts
        </div>
      </div>
    );
  }
  // Fallback: render labels + first dataset as a small table
  return (
    <div className="chart-wrap" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
        {spec.title} <span className="muted">({spec.type})</span>
      </div>
      <table className="db-table">
        <tbody>
          {spec.labels.slice(0, 12).map((lbl, i) => (
            <tr key={i}>
              <td>{String(lbl)}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {ds?.data[i] ?? ""}
              </td>
            </tr>
          ))}
          {spec.labels.length > 12 && (
            <tr>
              <td colSpan={2} className="muted">
                …{spec.labels.length - 12} more
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="row" style={{ marginTop: 8 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      {children}
    </div>
  );
}

function ToolCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {hint && <div className="muted">{hint}</div>}
      {children}
    </div>
  );
}


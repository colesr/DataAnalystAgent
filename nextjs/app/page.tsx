"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthMenu } from "./_components/AuthMenu";
import { ChatBot } from "./_components/ChatBot";
import { CleanPanel } from "./_components/CleanPanel";
import { DashboardPanel } from "./_components/DashboardPanel";
import { ImportDialog } from "./_components/ImportDialog";
import { Markdown } from "./_components/Markdown";
import { Modal } from "./_components/Modal";
import { PivotPanel } from "./_components/PivotPanel";
import { RealChart } from "./_components/RealChart";
import { SchemaProfile } from "./_components/SchemaProfile";
import { ToolsPanel } from "./_components/ToolsPanel";
import { ToolsPanelExtra } from "./_components/ToolsPanelExtra";

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

type SavedAnalysisMeta = {
  id: string;
  name: string;
  question: string;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScheduleRow = {
  id: string;
  analysisId: string;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type AlertRow = {
  id: string;
  name: string;
  sql: string;
  threshold: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastTriggeredAt: string | null;
  lastResult: string | null;
};

type AgentEvent =
  | { type: "start"; model: string }
  | { type: "text"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output?: unknown; error?: string }
  | { type: "chart"; spec: ChartSpec }
  | { type: "usage"; inputTokens: number; outputTokens: number; estCostUsd: number }
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

export default function Page() {
  const [tab, setTab] = useState<TabId>("ask");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [soundOn, setSoundOn] = useState(true);

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
  const [agentUsage, setAgentUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
  } | null>(null);
  // Follow-up support: history accumulates {role, text} after each successful run.
  const [convHistory, setConvHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [followupText, setFollowupText] = useState("");
  const agentAbortRef = useRef<AbortController | null>(null);

  // Phase 4: glossary, saved analyses, schedules, alerts
  const [glossaryText, setGlossaryText] = useState("");
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysisMeta[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  // Phase 13: dialog open states
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(false);

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

  const onImportSuccess = useCallback(
    async (result: { tableName: string; rowCount: number }) => {
      toast("success", `Imported ${result.tableName} (${result.rowCount} rows)`);
      await fetchDatasets();
    },
    [fetchDatasets, toast]
  );

  const loadDemoData = useCallback(async () => {
    try {
      const res = await fetch("/api/datasets/seed", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.alreadyExists) {
        toast("info", "Demo data already loaded");
      } else {
        toast("success", `Loaded demo_sales (${data.rowCount} rows)`);
      }
      await fetchDatasets();
    } catch (e: any) {
      toast("err", `Demo seed failed: ${e?.message ?? e}`);
    }
  }, [fetchDatasets, toast]);

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

  const runAgent = useCallback(async (q: string, history: { role: "user" | "assistant"; text: string }[] = []) => {
    if (!q.trim()) return;
    setAgentRunning(true);
    setAgentEvents([]);
    setAgentText("");
    setAgentCharts([]);
    setAgentError(null);
    setAgentUsage(null);

    const ctrl = new AbortController();
    agentAbortRef.current = ctrl;

    let collectedText = "";
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, model, history }),
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
            collectedText += ev.delta;
            setAgentText((prev) => prev + ev.delta);
          } else if (ev.type === "chart") {
            setAgentCharts((prev) => [...prev, ev.spec]);
          } else if (ev.type === "usage") {
            setAgentUsage({
              inputTokens: ev.inputTokens,
              outputTokens: ev.outputTokens,
              estCostUsd: ev.estCostUsd,
            });
          } else if (ev.type === "error") {
            setAgentError(ev.message);
          }
        }
      }
      // On success, append turn to history so a follow-up can include it.
      if (collectedText) {
        setConvHistory((prev) => [
          ...prev,
          { role: "user", text: q },
          { role: "assistant", text: collectedText },
        ]);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setAgentError(e?.message ?? String(e));
      }
    } finally {
      setAgentRunning(false);
      agentAbortRef.current = null;
    }
  }, [model]);

  const stopAgent = useCallback(() => {
    agentAbortRef.current?.abort();
  }, []);

  const exportReportMarkdown = useCallback(() => {
    if (!agentText) return;
    const parts: string[] = [];
    parts.push(`# Analysis: ${question || "Untitled"}\n`);
    parts.push(agentText);
    if (agentCharts.length > 0) {
      parts.push("\n\n## Charts");
      for (const c of agentCharts) {
        parts.push(`\n### ${c.title}`);
        parts.push("```json");
        parts.push(JSON.stringify(c, null, 2));
        parts.push("```");
      }
    }
    const blob = new Blob([parts.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [agentText, agentCharts, question]);

  const exportFirstChartPng = useCallback(() => {
    // Grab the first <canvas> the report rendered.
    const reportEl = document.getElementById("report");
    const canvas = reportEl?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      toast("err", "No chart to export");
      return;
    }
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `chart-${Date.now()}.png`;
      a.click();
    } catch (e: any) {
      toast("err", `PNG export failed: ${e?.message ?? e}`);
    }
  }, [toast]);

  // ---- Glossary ----
  const fetchGlossary = useCallback(async () => {
    try {
      const res = await fetch("/api/glossary", { cache: "no-store" });
      if (!res.ok) return;
      const data: { entries: { name: string; definition: string }[] } = await res.json();
      setGlossaryText(data.entries.map((e) => `${e.name}: ${e.definition}`).join("\n"));
    } catch {}
  }, []);

  const saveGlossary = useCallback(async () => {
    const entries = glossaryText
      .split("\n")
      .map((line) => {
        const idx = line.indexOf(":");
        if (idx < 0) return null;
        return {
          name: line.slice(0, idx).trim(),
          definition: line.slice(idx + 1).trim(),
        };
      })
      .filter((e): e is { name: string; definition: string } => Boolean(e?.name && e?.definition));
    try {
      const res = await fetch("/api/glossary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      toast("success", `Saved ${data.count} glossary entries`);
    } catch (e: any) {
      toast("err", `Save failed: ${e?.message ?? e}`);
    }
  }, [glossaryText, toast]);

  // ---- Saved analyses ----
  const fetchSavedAnalyses = useCallback(async () => {
    try {
      const res = await fetch("/api/analyses", { cache: "no-store" });
      if (!res.ok) return;
      const data: { analyses: SavedAnalysisMeta[] } = await res.json();
      setSavedAnalyses(data.analyses);
    } catch {}
  }, []);

  const openSaveDialog = useCallback(() => {
    if (!agentText) return;
    setSaveName(question.slice(0, 60) || "Untitled analysis");
    setSaveDialogOpen(true);
  }, [agentText, question]);

  const confirmSaveAnalysis = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          question,
          report: { text: agentText, charts: agentCharts, model },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast("success", `Saved "${name}"`);
      setSaveDialogOpen(false);
      await fetchSavedAnalyses();
    } catch (e: any) {
      toast("err", `Save failed: ${e?.message ?? e}`);
    }
  }, [saveName, agentText, agentCharts, question, model, fetchSavedAnalyses, toast]);

  const loadSavedAnalysis = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/analyses/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const report = (data.report ?? {}) as { text?: string; charts?: ChartSpec[]; model?: string };
        setQuestion(data.question);
        setAgentText(report.text ?? "");
        setAgentCharts(report.charts ?? []);
        setAgentEvents([]);
        setAgentError(null);
        if (report.model) setModel(report.model);
        setTab("ask");
        toast("info", `Loaded "${data.name}"`);
      } catch (e: any) {
        toast("err", `Load failed: ${e?.message ?? e}`);
      }
    },
    [toast]
  );

  const deleteSavedAnalysis = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Delete saved analysis "${name}"?`)) return;
      try {
        const res = await fetch(`/api/analyses/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast("success", `Deleted "${name}"`);
        await fetchSavedAnalyses();
      } catch (e: any) {
        toast("err", `Delete failed: ${e?.message ?? e}`);
      }
    },
    [fetchSavedAnalyses, toast]
  );

  const shareSavedAnalysis = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/analyses/${id}/share`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const url = `${window.location.origin}/a/${data.shareToken}`;
        try {
          await navigator.clipboard.writeText(url);
          toast("success", "Share link copied to clipboard");
        } catch {
          toast("info", `Share link: ${url}`);
        }
        await fetchSavedAnalyses();
      } catch (e: any) {
        toast("err", `Share failed: ${e?.message ?? e}`);
      }
    },
    [fetchSavedAnalyses, toast]
  );

  // ---- Schedules ----
  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules", { cache: "no-store" });
      if (!res.ok) return;
      const data: { schedules: ScheduleRow[] } = await res.json();
      setSchedules(data.schedules);
    } catch {}
  }, []);

  const setSchedule = useCallback(
    async (analysisId: string, cron: string) => {
      // Drop any existing schedule for this analysis first.
      try {
        await fetch(`/api/schedules?analysisId=${analysisId}`, { method: "DELETE" });
        if (cron && cron !== "off") {
          const res = await fetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysisId, cron }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        await fetchSchedules();
        toast("success", cron === "off" ? "Schedule cleared" : `Scheduled ${cron}`);
      } catch (e: any) {
        toast("err", `Schedule failed: ${e?.message ?? e}`);
      }
    },
    [fetchSchedules, toast]
  );

  // ---- Alerts ----
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) return;
      const data: { alerts: AlertRow[] } = await res.json();
      setAlerts(data.alerts);
    } catch {}
  }, []);

  const createAlert = useCallback(
    async (name: string, sqlText: string, threshold: string) => {
      try {
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, sql: sqlText, threshold }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast("success", `Alert "${name}" created`);
        await fetchAlerts();
      } catch (e: any) {
        toast("err", `Create alert failed: ${e?.message ?? e}`);
      }
    },
    [fetchAlerts, toast]
  );

  const deleteAlert = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Delete alert "${name}"?`)) return;
      try {
        const res = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast("success", `Deleted alert "${name}"`);
        await fetchAlerts();
      } catch (e: any) {
        toast("err", `Delete alert failed: ${e?.message ?? e}`);
      }
    },
    [fetchAlerts, toast]
  );

  // Load Phase 4 collections once on mount.
  useEffect(() => {
    fetchGlossary();
    fetchSavedAnalyses();
    fetchSchedules();
    fetchAlerts();
  }, [fetchGlossary, fetchSavedAnalyses, fetchSchedules, fetchAlerts]);

  // Show the first-run welcome modal on a visitor's first session.
  useEffect(() => {
    try {
      if (!localStorage.getItem("dda_welcome_seen")) setWelcomeOpen(true);
    } catch {}
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
            <AuthMenu />
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
              <button className="ghost tiny" onClick={loadDemoData}>
                Load demo data
              </button>
              <button className="ghost tiny" onClick={() => setImportDialogOpen(true)}>
                Import…
              </button>
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
                {convHistory.length > 0 && (
                  <span className="muted" style={{ fontSize: 10, marginRight: 8 }}>
                    {convHistory.length / 2} turn{convHistory.length / 2 === 1 ? "" : "s"} in convo
                  </span>
                )}
                <button
                  className="ghost tiny"
                  disabled={agentRunning}
                  onClick={() => {
                    setQuestion("");
                    setFollowupText("");
                    setAgentEvents([]);
                    setAgentText("");
                    setAgentCharts([]);
                    setAgentError(null);
                    setAgentUsage(null);
                    setConvHistory([]);
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
                  if (!agentRunning) runAgent(question, []);
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
                onClick={() => runAgent(question, [])}
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
              {agentUsage && (
                <div className="muted" style={{ marginTop: 8, fontSize: 10 }}>
                  {agentUsage.inputTokens.toLocaleString()} in /{" "}
                  {agentUsage.outputTokens.toLocaleString()} out tokens · est ${agentUsage.estCostUsd.toFixed(4)}
                </div>
              )}
            </div>
          )}

          {/* Final report — markdown text + collected charts */}
          {(agentText || agentCharts.length > 0) && (
            <div id="report" className="card">
              <h3>
                Final Report
                <span className="right">
                  <button className="ghost tiny" onClick={openSaveDialog}>
                    Save
                  </button>
                  <button className="ghost tiny" onClick={exportReportMarkdown}>
                    Export MD
                  </button>
                  <button
                    className="ghost tiny"
                    onClick={exportFirstChartPng}
                    disabled={agentCharts.length === 0}
                  >
                    Chart PNG
                  </button>
                </span>
              </h3>
              {agentText && (
                <div id="summary">
                  <Markdown>{agentText}</Markdown>
                </div>
              )}
              {agentCharts.length > 0 && (
                <>
                  <h4>Charts</h4>
                  <div className="charts-grid">
                    {agentCharts.map((c, i) => (
                      <RealChart key={i} spec={c} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Follow-up — only show after a successful run */}
          {agentText && !agentRunning && (
            <div className="card">
              <h3>Follow-up</h3>
              <textarea
                rows={2}
                placeholder="Ask a follow-up that builds on this analysis…"
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    if (followupText.trim()) {
                      const fq = followupText.trim();
                      setFollowupText("");
                      runAgent(fq, convHistory);
                    }
                  }
                }}
              />
              <button
                className="primary"
                disabled={!followupText.trim()}
                onClick={() => {
                  const fq = followupText.trim();
                  setFollowupText("");
                  runAgent(fq, convHistory);
                }}
              >
                Continue
              </button>
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
          <ToolsPanel datasets={datasets} />
          <ToolsPanelExtra datasets={datasets} />
        </section>

        {/* ============ DASHBOARD ============ */}
        <section className="tab-panel" hidden={tab !== "dashboard"}>
          <DashboardPanel toast={toast} />
        </section>

        {/* ============ CLEAN ============ */}
        <section className="tab-panel" hidden={tab !== "clean"}>
          <CleanPanel datasets={datasets} onChanged={fetchDatasets} toast={toast} />
        </section>

        {/* ============ PIVOT ============ */}
        <section className="tab-panel" hidden={tab !== "pivot"}>
          <PivotPanel datasets={datasets} />
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
              prompt on every Ask run.
            </div>
            <textarea
              className="code"
              rows={10}
              value={glossaryText}
              onChange={(e) => setGlossaryText(e.target.value)}
              placeholder={
                "active_user: customer with at least one purchase in the last 30 days\n" +
                "margin_rate: (revenue - cost) / revenue\n" +
                "fiscal_year: starts February 1\n" +
                "last_month: the most recent fully completed calendar month"
              }
            />
            <button className="primary" onClick={saveGlossary}>
              Save glossary
            </button>
          </div>
        </section>

        {/* ============ SAVED ============ */}
        <section className="tab-panel" hidden={tab !== "saved"}>
          <div className="card">
            <h3>
              Saved Analyses <span className="badge">{savedAnalyses.length}</span>
            </h3>
            <div className="muted" style={{ marginBottom: 8 }}>
              Load restores the report into the Ask tab. Schedule re-runs the agent on the
              latest data automatically.
            </div>
            {savedAnalyses.length === 0 ? (
              <div className="muted">
                No saved analyses yet. Run an analysis on the Ask tab and click Save.
              </div>
            ) : (
              savedAnalyses.map((a) => {
                const sched = schedules.find((s) => s.analysisId === a.id);
                return (
                  <div key={a.id} className="saved-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="name" style={{ flex: 1 }}>
                        {a.name}
                        <div className="meta">
                          {a.question.length > 80 ? a.question.slice(0, 80) + "…" : a.question}
                        </div>
                      </div>
                      <button className="ghost tiny" onClick={() => loadSavedAnalysis(a.id)}>
                        Load
                      </button>
                      <button className="ghost tiny" onClick={() => shareSavedAnalysis(a.id)}>
                        {a.shareToken ? "Re-share" : "Share"}
                      </button>
                      <button
                        className="ghost tiny danger"
                        onClick={() => deleteSavedAnalysis(a.id, a.name)}
                      >
                        Delete
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <span className="muted" style={{ fontSize: 10 }}>
                        Schedule:
                      </span>
                      <select
                        value={sched?.cron ?? "off"}
                        onChange={(e) => setSchedule(a.id, e.target.value)}
                        style={{ width: "auto", flex: "0 0 auto" }}
                      >
                        <option value="off">off</option>
                        <option value="hourly">hourly</option>
                        <option value="daily">daily</option>
                        <option value="weekly">weekly</option>
                      </select>
                      {sched?.lastRunAt && (
                        <span className="muted" style={{ fontSize: 10 }}>
                          last run {new Date(sched.lastRunAt).toLocaleString()}
                        </span>
                      )}
                      {a.shareToken && (
                        <a
                          className="muted"
                          style={{ fontSize: 10, marginLeft: "auto" }}
                          href={`/a/${a.shareToken}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          /a/{a.shareToken.slice(0, 8)}…
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <AlertsCard
            alerts={alerts}
            onCreate={createAlert}
            onDelete={deleteAlert}
            datasets={datasets}
          />
        </section>

        {/* ============ SCHEMA ============ */}
        <section className="tab-panel" hidden={tab !== "schema"}>
          <SchemaProfile datasets={datasets} onError={(m) => toast("err", m)} />
        </section>
      </div>

      {/* ============ DIALOGS ============ */}
      <ImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={onImportSuccess}
      />

      <Modal
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        title="Save analysis"
        footer={
          <>
            <button className="ghost" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </button>
            <button
              className="primary"
              style={{ marginTop: 0 }}
              onClick={confirmSaveAnalysis}
              disabled={!saveName.trim()}
            >
              Save
            </button>
          </>
        }
      >
        <label className="lbl">Name</label>
        <input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmSaveAnalysis();
          }}
          placeholder="Untitled analysis"
        />
      </Modal>

      <Modal
        open={welcomeOpen}
        onClose={() => {
          setWelcomeOpen(false);
          try {
            localStorage.setItem("dda_welcome_seen", "1");
          } catch {}
        }}
        title="Welcome to Digital Data Analyst"
        maxWidth={520}
        footer={
          <>
            <button
              className="ghost"
              onClick={() => {
                setWelcomeOpen(false);
                try {
                  localStorage.setItem("dda_welcome_seen", "1");
                } catch {}
              }}
            >
              Skip
            </button>
            <button
              className="primary"
              style={{ marginTop: 0 }}
              onClick={async () => {
                try {
                  localStorage.setItem("dda_welcome_seen", "1");
                } catch {}
                setWelcomeOpen(false);
                await loadDemoData();
                setQuestion("Which region had the highest revenue last month?");
                setTab("ask");
              }}
            >
              Try a sample question
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 8px" }}>
            This is an AI-assisted data analyst. You upload CSVs (or paste a Sheet/Postgres
            URL), then ask questions in plain English — the agent runs SQL against your data
            and writes a markdown report.
          </p>
          <p style={{ margin: "8px 0" }}>
            <strong>Click "Try a sample question"</strong> below to load a small demo dataset
            and ask the agent about it. You can also use the <strong>?</strong> button at the
            bottom-right for help anytime.
          </p>
        </div>
      </Modal>

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
      <ChatBot model={model} />
    </>
  );
}

/* -------------------------------------------------- */
/* Small layout helpers                                */
/* -------------------------------------------------- */

function AlertsCard({
  alerts,
  onCreate,
  onDelete,
  datasets,
}: {
  alerts: AlertRow[];
  onCreate: (name: string, sql: string, threshold: string) => void;
  onDelete: (id: string, name: string) => void;
  datasets: DatasetMeta[];
}) {
  const [name, setName] = useState("");
  const [sqlText, setSqlText] = useState("");
  const [threshold, setThreshold] = useState("0");
  return (
    <div className="card">
      <h3>
        Alerts <span className="badge">{alerts.length}</span>
      </h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        Each alert is a SQL query that should normally return ≤ <code>threshold</code> rows.
        When a check finds more, the alert is marked triggered. Checks run via{" "}
        <code>POST /api/alerts/check</code> (cron-secret protected).
      </div>

      {alerts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {alerts.map((a) => (
            <div key={a.id} className="qh-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="qh-source"
                  style={{
                    background: a.lastTriggeredAt ? "rgba(248,113,113,0.15)" : "var(--bg-3)",
                    color: a.lastTriggeredAt ? "var(--err)" : "var(--muted)",
                  }}
                >
                  {a.lastTriggeredAt ? "triggered" : "ok"}
                </span>
                <span style={{ flex: 1, fontWeight: 600 }}>{a.name}</span>
                <button className="ghost tiny danger" onClick={() => onDelete(a.id, a.name)}>
                  Delete
                </button>
              </div>
              <div className="qh-sql" style={{ whiteSpace: "normal" }}>
                {a.sql}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>
                threshold {a.threshold}
                {a.lastResult && ` · ${a.lastResult}`}
                {a.lastRunAt && ` · checked ${new Date(a.lastRunAt).toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          placeholder="Alert name (e.g. 'No negative revenue')"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="code"
          rows={3}
          placeholder={
            datasets[0]
              ? `SELECT * FROM ${datasets[0].tableName} WHERE revenue < 0`
              : "SELECT * FROM ... WHERE <bad condition>"
          }
          value={sqlText}
          onChange={(e) => setSqlText(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label className="muted" style={{ fontSize: 11 }}>
            Threshold:
          </label>
          <input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            style={{ width: 80 }}
          />
          <button
            className="primary"
            style={{ marginTop: 0 }}
            disabled={!name.trim() || !sqlText.trim()}
            onClick={() => {
              onCreate(name.trim(), sqlText.trim(), threshold);
              setName("");
              setSqlText("");
              setThreshold("0");
            }}
          >
            Add alert
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}



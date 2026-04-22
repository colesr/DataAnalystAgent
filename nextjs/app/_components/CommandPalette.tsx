"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StepId, SubTabId } from "./WorkflowSteps";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  action: () => void;
};

/**
 * Build the standard command list from the page's navigation handlers.
 * Keeping this outside the component lets `page.tsx` pass the action
 * callbacks without a circular import.
 */
export function buildCommands(opts: {
  goto: (sub: SubTabId) => void;
  selectStep: (step: StepId) => void;
  openImport: () => void;
  loadDemo: () => void;
  toggleTheme: () => void;
  openCoach: () => void;
  newConversation: () => void;
  openHelp: () => void;
  openCatalog: () => void;
}): Command[] {
  const { goto, selectStep, openImport, loadDemo, toggleTheme, openCoach, newConversation, openHelp, openCatalog } = opts;
  return [
    // Workflow steps
    { id: "step-define", label: "Go to: Define", group: "Steps", keywords: "1 brief problem", action: () => selectStep("define") },
    { id: "step-acquire", label: "Go to: Acquire", group: "Steps", keywords: "2 import data", action: () => selectStep("acquire") },
    { id: "step-clean", label: "Go to: Clean", group: "Steps", keywords: "3 wrangle", action: () => selectStep("clean") },
    { id: "step-eda", label: "Go to: EDA", group: "Steps", keywords: "4 explore analyze", action: () => selectStep("eda") },
    { id: "step-model", label: "Go to: Model", group: "Steps", keywords: "5 statistics ml", action: () => selectStep("model") },
    { id: "step-communicate", label: "Go to: Communicate", group: "Steps", keywords: "6 dashboard share", action: () => selectStep("communicate") },
    { id: "step-deploy", label: "Go to: Deploy", group: "Steps", keywords: "7 schedule alert", action: () => selectStep("deploy") },
    // Direct subtab jumps
    { id: "go-ask", label: "Open: Ask AI", group: "EDA", keywords: "agent claude gemini question nl sql", action: () => goto("ask") },
    { id: "go-schema", label: "Open: Schema profile", group: "EDA", keywords: "columns types stats", action: () => goto("schema") },
    { id: "go-pivot", label: "Open: Pivot", group: "EDA", keywords: "group by aggregate", action: () => goto("pivot") },
    { id: "go-tools", label: "Open: Tool cards", group: "EDA", keywords: "28 tools", action: () => goto("tools") },
    { id: "go-summary", label: "Open: Auto-summary", group: "EDA", keywords: "stats describe", action: () => goto("eda-summary") },
    { id: "go-corr", label: "Open: Correlation matrix", group: "EDA", keywords: "pearson relationship", action: () => goto("eda-correlations") },
    { id: "go-insights", label: "Open: Interesting facts", group: "EDA", keywords: "anomalies findings", action: () => goto("eda-insights") },
    { id: "go-data", label: "Open: Datasets browser", group: "Acquire", keywords: "rows table", action: () => goto("data") },
    { id: "go-clean", label: "Open: Clean tools", group: "Clean", keywords: "dedupe parse drop", action: () => goto("clean") },
    { id: "go-dashboard", label: "Open: Dashboards", group: "Communicate", keywords: "chart tile", action: () => goto("dashboard") },
    { id: "go-saved", label: "Open: Saved analyses", group: "Communicate", keywords: "share link", action: () => goto("saved") },
    { id: "go-deploy-schedules", label: "Open: Schedules", group: "Deploy", keywords: "cron rerun", action: () => goto("deploy-schedules") },
    { id: "go-deploy-alerts", label: "Open: Alerts", group: "Deploy", keywords: "threshold notify", action: () => goto("deploy-alerts") },
    { id: "go-sql", label: "Open: SQL editor", group: "Workbench", keywords: "raw query", action: () => goto("sql") },
    { id: "go-glossary", label: "Open: Glossary", group: "Workbench", keywords: "terms metrics definition", action: () => goto("glossary") },
    // Actions
    { id: "act-import", label: "Import data… (URL / Sheet / Postgres)", group: "Actions", action: openImport },
    { id: "act-demo", label: "Load demo dataset", group: "Actions", action: loadDemo },
    { id: "act-new-conv", label: "New AI conversation", group: "Actions", action: newConversation },
    { id: "act-coach", label: "Open Coach", group: "Actions", keywords: "help guide tutorial walkthrough", action: openCoach },
    { id: "act-theme", label: "Toggle dark/light theme", group: "Actions", action: toggleTheme },
    { id: "act-help", label: "Show welcome / help", group: "Actions", action: openHelp },
    { id: "act-catalog", label: "Browse all features", group: "Actions", keywords: "catalog index list everything", action: openCatalog },
  ];
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((tok) => hay.includes(tok));
    });
  }, [query, commands]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIdx];
        if (cmd) {
          cmd.action();
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIdx, onClose]);

  // Reset highlight when filter shrinks
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  // Keep the active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;
  return (
    <div className="palette-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a feature, action, or step…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="palette-empty muted">No matches</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                type="button"
                data-idx={i}
                className={`palette-row ${i === activeIdx ? "active" : ""}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => {
                  c.action();
                  onClose();
                }}
              >
                <span className="palette-label">{c.label}</span>
                <span className="palette-group">{c.group}</span>
              </button>
            ))
          )}
        </div>
        <div className="palette-footer muted">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

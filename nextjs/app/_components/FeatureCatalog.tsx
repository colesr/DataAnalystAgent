"use client";

import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import type { StepId, SubTabId } from "./WorkflowSteps";

export type CatalogAction =
  | { kind: "go_to_subtab"; subtab: SubTabId }
  | { kind: "go_to_step"; step: StepId }
  | { kind: "open_import" }
  | { kind: "load_demo" }
  | { kind: "open_palette" }
  | { kind: "open_coach" };

type FeatureEntry = {
  id: string;
  name: string;
  desc: string;
  step: StepId;
  status?: "live" | "soon";
  action: CatalogAction;
};

const CATALOG: FeatureEntry[] = [
  // Define
  { id: "f-brief", name: "Project brief", desc: "One-page brief: question, stakeholder, success criteria.", step: "define", action: { kind: "go_to_subtab", subtab: "define-brief" } },
  { id: "f-questions", name: "Stakeholder questions", desc: "200+ clarifying questions to send before scoping.", step: "define", action: { kind: "go_to_subtab", subtab: "define-questions" } },
  { id: "f-metrics", name: "Success-metric library", desc: "Browse common KPIs by industry / function.", step: "define", action: { kind: "go_to_subtab", subtab: "define-metrics" } },

  // Acquire
  { id: "f-upload", name: "Upload CSV / Excel", desc: "Drag-drop a file. Becomes a real Postgres table.", step: "acquire", action: { kind: "go_to_subtab", subtab: "data" } },
  { id: "f-import", name: "Import URL / Sheet / Postgres", desc: "Pull from any of three external sources.", step: "acquire", action: { kind: "open_import" } },
  { id: "f-demo", name: "Load demo dataset", desc: "Sample sales data so you can poke around immediately.", step: "acquire", action: { kind: "load_demo" } },
  { id: "f-browser", name: "Datasets browser", desc: "Paginated row browser, sortable columns, filter.", step: "acquire", action: { kind: "go_to_subtab", subtab: "data" } },

  // Clean
  { id: "f-clean", name: "Clean toolkit", desc: "Dedupe, parse dates, drop columns, derive new ones.", step: "clean", action: { kind: "go_to_subtab", subtab: "clean" } },
  { id: "f-missing", name: "Missing-value heatmap", desc: "Visualize where nulls cluster across columns.", step: "clean", action: { kind: "go_to_subtab", subtab: "clean" } },
  { id: "f-fuzzy", name: "Fuzzy dedupe", desc: "Merge near-duplicate text values (Levenshtein).", step: "clean", action: { kind: "go_to_subtab", subtab: "clean" } },
  { id: "f-regex", name: "Regex extractor", desc: "Pull capture groups out of a text column into new columns.", step: "clean", action: { kind: "go_to_subtab", subtab: "clean" } },

  // EDA
  { id: "f-ask", name: "Ask AI", desc: "Natural-language question → SQL → markdown report. Runs locally.", step: "eda", action: { kind: "go_to_subtab", subtab: "ask" } },
  { id: "f-schema", name: "Schema profiler", desc: "Auto-detected types, histograms, top values.", step: "eda", action: { kind: "go_to_subtab", subtab: "schema" } },
  { id: "f-summary", name: "Auto-summary", desc: "Per-column statistics in one glance.", step: "eda", action: { kind: "go_to_subtab", subtab: "eda-summary" } },
  { id: "f-corr", name: "Correlation matrix", desc: "Pairwise Pearson correlation across numeric columns.", step: "eda", action: { kind: "go_to_subtab", subtab: "eda-correlations" } },
  { id: "f-insights", name: "Interesting facts", desc: "Heuristic scan: spikes, concentrations, outliers.", step: "eda", action: { kind: "go_to_subtab", subtab: "eda-insights" } },
  { id: "f-pivot", name: "Pivot table", desc: "Group by + aggregate, browser-side.", step: "eda", action: { kind: "go_to_subtab", subtab: "pivot" } },
  { id: "f-tools", name: "28 tool cards", desc: "Pre-built one-click analyses.", step: "eda", action: { kind: "go_to_subtab", subtab: "tools" } },

  // Model
  { id: "f-regression", name: "Regression", desc: "Linear regression with coefficients, R², residuals.", step: "model", action: { kind: "go_to_subtab", subtab: "model-regression" } },
  { id: "f-clustering", name: "K-means clustering", desc: "Auto-suggest k, color points, summarize clusters.", step: "model", action: { kind: "go_to_subtab", subtab: "model-clustering" } },
  { id: "f-timeseries", name: "Time-series decomposition", desc: "Trend + residual via moving average.", step: "model", action: { kind: "go_to_subtab", subtab: "model-timeseries" } },
  { id: "f-abtest", name: "A/B significance", desc: "Two-sample t-test or proportion z-test with verdict.", step: "model", action: { kind: "go_to_subtab", subtab: "model-abtest" } },

  // Communicate
  { id: "f-dashboards", name: "Dashboards", desc: "SQL-backed tiles: bar / line / pie / map / treemap / sankey.", step: "communicate", action: { kind: "go_to_subtab", subtab: "dashboard" } },
  { id: "f-saved", name: "Saved analyses", desc: "Save a report, generate a public share link.", step: "communicate", action: { kind: "go_to_subtab", subtab: "saved" } },

  // Deploy
  { id: "f-schedules", name: "Schedules", desc: "Re-run a saved analysis hourly / daily / weekly.", step: "deploy", action: { kind: "go_to_subtab", subtab: "deploy-schedules" } },
  { id: "f-alerts", name: "Alerts", desc: "SQL + threshold; email via Resend or Slack webhook.", step: "deploy", action: { kind: "go_to_subtab", subtab: "deploy-alerts" } },

  // Workbench
  { id: "f-sql", name: "SQL editor", desc: "Raw SQL against the workspace schema.", step: "workbench", action: { kind: "go_to_subtab", subtab: "sql" } },
  { id: "f-glossary", name: "Metric glossary", desc: "Definitions auto-injected into the AI agent's prompt.", step: "workbench", action: { kind: "go_to_subtab", subtab: "glossary" } },

  // Helpers
  { id: "f-coach", name: "Coach", desc: "In-app guide that walks you through whichever step you're on.", step: "workbench", action: { kind: "open_coach" } },
  { id: "f-palette", name: "Command palette (⌘K)", desc: "Type-to-jump to any feature.", step: "workbench", action: { kind: "open_palette" } },
];

const STEP_LABEL: Record<StepId, string> = {
  define: "1 · Define",
  acquire: "2 · Acquire",
  clean: "3 · Clean",
  eda: "4 · EDA",
  model: "5 · Model",
  communicate: "6 · Communicate",
  deploy: "7 · Deploy",
  workbench: "Workbench & helpers",
};
const STEP_ORDER: StepId[] = [
  "define",
  "acquire",
  "clean",
  "eda",
  "model",
  "communicate",
  "deploy",
  "workbench",
];

export function FeatureCatalog({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onAction: (a: CatalogAction) => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? CATALOG.filter((f) =>
          `${f.name} ${f.desc} ${STEP_LABEL[f.step]}`.toLowerCase().includes(q)
        )
      : CATALOG;
    const map = new Map<StepId, FeatureEntry[]>();
    for (const f of matches) {
      if (!map.has(f.step)) map.set(f.step, []);
      map.get(f.step)!.push(f);
    }
    return STEP_ORDER.filter((s) => map.has(s)).map((s) => ({
      step: s,
      label: STEP_LABEL[s],
      items: map.get(s)!,
    }));
  }, [query]);

  return (
    <Modal open={open} onClose={onClose} title="All features" maxWidth={760}>
      <p className="muted" style={{ marginTop: 0 }}>
        Browse every capability in the app. Click any card to jump straight to it — you don't
        have to follow the workflow in order.
      </p>
      <input
        type="search"
        placeholder="Search features…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{ marginBottom: 12 }}
      />
      <div className="catalog-scroll">
        {grouped.length === 0 ? (
          <div className="muted">No matches.</div>
        ) : (
          grouped.map((g) => (
            <section key={g.step} className="catalog-group">
              <h4 className="catalog-group-label">{g.label}</h4>
              <div className="catalog-grid">
                {g.items.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="catalog-card"
                    onClick={() => {
                      onAction(f.action);
                      onClose();
                    }}
                  >
                    <div className="catalog-card-name">{f.name}</div>
                    <div className="catalog-card-desc">{f.desc}</div>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}

"use client";

export type SubTabId =
  | "define-brief"
  | "define-questions"
  | "define-metrics"
  | "data"
  | "clean"
  | "ask"
  | "schema"
  | "eda-summary"
  | "eda-correlations"
  | "eda-insights"
  | "pivot"
  | "tools"
  | "model-regression"
  | "model-clustering"
  | "model-timeseries"
  | "model-abtest"
  | "dashboard"
  | "saved"
  | "deploy-schedules"
  | "deploy-alerts"
  | "sql"
  | "glossary";

export type StepId =
  | "define"
  | "acquire"
  | "clean"
  | "eda"
  | "model"
  | "communicate"
  | "deploy"
  | "workbench";

export type SubTabDef = { id: SubTabId; label: string; placeholder?: boolean };
export type StepDef = {
  id: StepId;
  label: string;
  num: number | null;
  tagline: string;
  description: string;
  subtabs: SubTabDef[];
};

export const STEPS: StepDef[] = [
  {
    id: "define",
    label: "Define",
    num: 1,
    tagline: "Frame the problem and define success.",
    description:
      "Capture the business question, the stakeholders, and what 'done' looks like — before you touch any data.",
    subtabs: [
      { id: "define-brief", label: "Brief", placeholder: true },
      { id: "define-questions", label: "Stakeholder Q's", placeholder: true },
      { id: "define-metrics", label: "Success metrics", placeholder: true },
    ],
  },
  {
    id: "acquire",
    label: "Acquire",
    num: 2,
    tagline: "Pull in data from any source.",
    description:
      "CSV, Excel, public URL, Google Sheets, or external Postgres — every file becomes a real table you can query.",
    subtabs: [{ id: "data", label: "Datasets" }],
  },
  {
    id: "clean",
    label: "Clean",
    num: 3,
    tagline: "Fix and standardize messy data.",
    description:
      "Dedupe rows, parse dates, drop columns, add derived columns. Most analyst time lives here — these tools cut it down.",
    subtabs: [{ id: "clean", label: "Clean tools" }],
  },
  {
    id: "eda",
    label: "EDA",
    num: 4,
    tagline: "Explore patterns, distributions, anomalies.",
    description:
      "Find what's interesting before you commit to an analysis. Auto-profile the schema, ask questions in plain English, slice with pivots.",
    subtabs: [
      { id: "ask", label: "Ask AI" },
      { id: "schema", label: "Schema profile" },
      { id: "eda-summary", label: "Auto-summary" },
      { id: "eda-correlations", label: "Correlations" },
      { id: "eda-insights", label: "Insights" },
      { id: "pivot", label: "Pivot" },
      { id: "tools", label: "Tool cards" },
    ],
  },
  {
    id: "model",
    label: "Model",
    num: 5,
    tagline: "Apply statistics and ML.",
    description:
      "Quantify relationships, cluster groups, decompose time series, run A/B tests — all in-browser, no Python required.",
    subtabs: [
      { id: "model-regression", label: "Regression", placeholder: true },
      { id: "model-clustering", label: "Clustering", placeholder: true },
      { id: "model-timeseries", label: "Time series", placeholder: true },
      { id: "model-abtest", label: "A/B significance", placeholder: true },
    ],
  },
  {
    id: "communicate",
    label: "Communicate",
    num: 6,
    tagline: "Build dashboards, share insights.",
    description:
      "Turn analyses into living dashboards, save them with a public link, export markdown or PNG for stakeholders.",
    subtabs: [
      { id: "dashboard", label: "Dashboards" },
      { id: "saved", label: "Saved analyses" },
    ],
  },
  {
    id: "deploy",
    label: "Deploy",
    num: 7,
    tagline: "Schedule, monitor, alert.",
    description:
      "Re-run analyses on the latest data, fire alerts when something looks wrong, watch for drift.",
    subtabs: [
      { id: "deploy-schedules", label: "Schedules" },
      { id: "deploy-alerts", label: "Alerts" },
    ],
  },
  {
    id: "workbench",
    label: "Workbench",
    num: null,
    tagline: "Power-user tools. Always available.",
    description:
      "Drop into raw SQL or maintain the metric glossary the AI sees on every run.",
    subtabs: [
      { id: "sql", label: "SQL" },
      { id: "glossary", label: "Glossary" },
    ],
  },
];

const SUBTAB_TO_STEP: Record<SubTabId, StepId> = (() => {
  const m: Partial<Record<SubTabId, StepId>> = {};
  for (const s of STEPS) for (const t of s.subtabs) m[t.id] = s.id;
  return m as Record<SubTabId, StepId>;
})();

export function findStep(id: StepId): StepDef {
  return STEPS.find((s) => s.id === id)!;
}

export function stepForSubtab(sub: SubTabId): StepDef {
  return findStep(SUBTAB_TO_STEP[sub]);
}

export function StepNav({
  currentStep,
  onSelect,
}: {
  currentStep: StepId;
  onSelect: (step: StepId) => void;
}) {
  const numbered = STEPS.filter((s) => s.num !== null);
  const workbench = STEPS.find((s) => s.id === "workbench")!;
  return (
    <nav className="step-nav" aria-label="Workflow steps">
      {numbered.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`step-btn ${currentStep === s.id ? "active" : ""}`}
          onClick={() => onSelect(s.id)}
          title={s.tagline}
        >
          <span className="step-num">{s.num}</span>
          <span className="step-label">{s.label}</span>
        </button>
      ))}
      <div className="step-spacer" />
      <button
        type="button"
        className={`step-btn workbench ${currentStep === "workbench" ? "active" : ""}`}
        onClick={() => onSelect("workbench")}
        title={workbench.tagline}
      >
        <span className="step-label">{workbench.label}</span>
      </button>
    </nav>
  );
}

export function SubTabNav({
  step,
  currentSubtab,
  onSelect,
}: {
  step: StepDef;
  currentSubtab: SubTabId;
  onSelect: (s: SubTabId) => void;
}) {
  if (step.subtabs.length <= 1) return null;
  return (
    <nav className="sub-tabs" aria-label={`${step.label} sub-tabs`}>
      {step.subtabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={currentSubtab === t.id ? "active" : ""}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {t.placeholder && <span className="soon">soon</span>}
        </button>
      ))}
    </nav>
  );
}

export function StepHero({
  step,
  onCoach,
}: {
  step: StepDef;
  onCoach: () => void;
}) {
  return (
    <div className="step-hero">
      <div className="step-hero-meta">
        {step.num !== null && <span className="step-hero-num">Step {step.num}</span>}
        <span className="step-hero-title">{step.tagline}</span>
      </div>
      <p className="step-hero-desc">{step.description}</p>
      <button className="ghost tiny" onClick={onCoach}>
        Coach me through {step.label} →
      </button>
    </div>
  );
}

export function PlaceholderPanel({
  title,
  intro,
  bullets,
}: {
  title: string;
  intro: string;
  bullets: string[];
}) {
  return (
    <div className="card placeholder-card">
      <h3>
        {title} <span className="badge">coming soon</span>
      </h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {intro}
      </p>
      <ul className="placeholder-list">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

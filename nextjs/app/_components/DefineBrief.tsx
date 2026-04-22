"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "dda_define_brief";

type Brief = {
  question: string;
  stakeholder: string;
  decision: string;
  audience: string;
  success: string;
  deadline: string;
  scope: string;
};

const EMPTY: Brief = {
  question: "",
  stakeholder: "",
  decision: "",
  audience: "",
  success: "",
  deadline: "",
  scope: "",
};

const PROMPTS: { key: keyof Brief; label: string; hint: string; multiline?: boolean }[] = [
  {
    key: "question",
    label: "What is the business question?",
    hint: "Phrase it as a single, specific question. Avoid solution-shaped framings ('build me a dashboard').",
    multiline: true,
  },
  { key: "stakeholder", label: "Who is asking?", hint: "Person + role. E.g. 'Maria, VP Sales'." },
  {
    key: "decision",
    label: "What decision will the answer drive?",
    hint: "If nothing changes regardless of answer, the analysis isn't worth doing.",
    multiline: true,
  },
  { key: "audience", label: "Who will read the result?", hint: "Stakeholder, exec team, ops, customers, etc." },
  {
    key: "success",
    label: "What does 'done' look like?",
    hint: "A single chart? A model? A 1-page memo? A live dashboard? Be concrete.",
    multiline: true,
  },
  { key: "deadline", label: "When is it needed?", hint: "Hard date, soft date, or 'before next quarterly review'." },
  {
    key: "scope",
    label: "What is explicitly OUT of scope?",
    hint: "Forces a sharp boundary so the analysis doesn't sprawl.",
    multiline: true,
  },
];

function load(): Brief {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return EMPTY;
  }
}

function save(b: Brief) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {}
}

function exportMarkdown(b: Brief): string {
  return [
    `# Project Brief`,
    ``,
    `## Question\n${b.question || "(unspecified)"}`,
    ``,
    `## Stakeholder\n${b.stakeholder || "(unspecified)"}`,
    ``,
    `## Decision driven\n${b.decision || "(unspecified)"}`,
    ``,
    `## Audience\n${b.audience || "(unspecified)"}`,
    ``,
    `## Success criteria\n${b.success || "(unspecified)"}`,
    ``,
    `## Deadline\n${b.deadline || "(unspecified)"}`,
    ``,
    `## Out of scope\n${b.scope || "(unspecified)"}`,
  ].join("\n");
}

export function DefineBrief() {
  const [brief, setBrief] = useState<Brief>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBrief(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(brief);
  }, [brief, hydrated]);

  const filled = Object.values(brief).filter((v) => v.trim().length > 0).length;
  const total = PROMPTS.length;

  return (
    <div className="card">
      <h3>
        Project brief
        <span className="badge">{filled}/{total} filled</span>
        <span className="right">
          <button
            className="ghost tiny"
            onClick={() => {
              const md = exportMarkdown(brief);
              const blob = new Blob([md], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `project-brief-${Date.now()}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export MD
          </button>
          <button
            className="ghost tiny danger"
            onClick={() => {
              if (confirm("Clear the brief?")) setBrief(EMPTY);
            }}
          >
            Clear
          </button>
        </span>
      </h3>
      <div className="muted" style={{ marginBottom: 12 }}>
        Capture the framing before you touch any data. Saved to your browser. Export it as
        Markdown to share with stakeholders.
      </div>
      {PROMPTS.map((p) => (
        <div key={p.key} className="model-section">
          <label className="lbl">{p.label}</label>
          {p.multiline ? (
            <textarea
              rows={2}
              placeholder={p.hint}
              value={brief[p.key]}
              onChange={(e) => setBrief({ ...brief, [p.key]: e.target.value })}
            />
          ) : (
            <input
              placeholder={p.hint}
              value={brief[p.key]}
              onChange={(e) => setBrief({ ...brief, [p.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

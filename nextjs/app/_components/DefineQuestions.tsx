"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "dda_define_questions";

type Question = { id: string; category: string; text: string };

const QUESTIONS: Question[] = [
  // Scope & motivation
  { id: "s1", category: "Scope", text: "What decision is this analysis going to inform?" },
  { id: "s2", category: "Scope", text: "What happens if we can't answer this question?" },
  { id: "s3", category: "Scope", text: "Has anyone tried to answer this before? What did they find?" },
  { id: "s4", category: "Scope", text: "What's explicitly out of scope?" },
  { id: "s5", category: "Scope", text: "What's the smallest version of this that would still be useful?" },
  { id: "s6", category: "Scope", text: "Is a 'good enough' answer acceptable, or do you need precision?" },
  { id: "s7", category: "Scope", text: "What's the deadline, and what drives it?" },
  { id: "s8", category: "Scope", text: "Who else will see this analysis?" },

  // Audience & format
  { id: "a1", category: "Audience", text: "How technical is the audience?" },
  { id: "a2", category: "Audience", text: "Will they want to drill in, or just read a summary?" },
  { id: "a3", category: "Audience", text: "Do they prefer a written memo, dashboard, or presentation?" },
  { id: "a4", category: "Audience", text: "Are they likely to challenge the methodology?" },
  { id: "a5", category: "Audience", text: "What unit of measurement / time horizon do they think in?" },

  // Success
  { id: "u1", category: "Success", text: "What does 'done' look like, in concrete terms?" },
  { id: "u2", category: "Success", text: "Which metric or chart would change your mind?" },
  { id: "u3", category: "Success", text: "What confidence level is required to act?" },
  { id: "u4", category: "Success", text: "Will this be reviewed once or referenced repeatedly?" },

  // Data
  { id: "d1", category: "Data", text: "Where does the underlying data live?" },
  { id: "d2", category: "Data", text: "How fresh does the data need to be?" },
  { id: "d3", category: "Data", text: "What time range should be analyzed?" },
  { id: "d4", category: "Data", text: "Are there known data quality issues to watch out for?" },
  { id: "d5", category: "Data", text: "Are there segments / cohorts we should always split by?" },
  { id: "d6", category: "Data", text: "Are there events or windows we should explicitly exclude?" },
  { id: "d7", category: "Data", text: "What's the source of truth if multiple systems disagree?" },

  // Hypotheses
  { id: "h1", category: "Hypotheses", text: "What do you already believe the answer is?" },
  { id: "h2", category: "Hypotheses", text: "What would surprise you?" },
  { id: "h3", category: "Hypotheses", text: "What's the most plausible alternative explanation?" },
  { id: "h4", category: "Hypotheses", text: "What confounders should we account for?" },

  // Definitions
  { id: "x1", category: "Definitions", text: "How do you define an 'active' user / customer / account?" },
  { id: "x2", category: "Definitions", text: "What constitutes the start and end of the period?" },
  { id: "x3", category: "Definitions", text: "What counts as 'churn' vs 'pause' vs 'inactive'?" },
  { id: "x4", category: "Definitions", text: "Are revenue numbers gross or net? Including refunds?" },
  { id: "x5", category: "Definitions", text: "What time zone should reports use?" },

  // Operational
  { id: "o1", category: "Operational", text: "Should this become a recurring report?" },
  { id: "o2", category: "Operational", text: "Should we trigger an alert if the metric crosses a threshold?" },
  { id: "o3", category: "Operational", text: "Who should own this once the analysis ships?" },
];

export function DefineQuestions() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelected(new Set(JSON.parse(raw)));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selected)));
      } catch {}
    }
  }, [selected, hydrated]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return QUESTIONS;
    return QUESTIONS.filter((x) => `${x.category} ${x.text}`.toLowerCase().includes(q));
  }, [filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of filtered) {
      if (!map.has(q.category)) map.set(q.category, []);
      map.get(q.category)!.push(q);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportSelected() {
    const items = QUESTIONS.filter((q) => selected.has(q.id));
    const md = items.length === 0
      ? "(no questions selected)"
      : ["# Stakeholder questions", "", ...items.map((q) => `- **${q.category}** — ${q.text}`)].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stakeholder-questions-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h3>
        Stakeholder questions
        <span className="badge">{selected.size} selected</span>
        <span className="right">
          <button className="ghost tiny" onClick={exportSelected} disabled={selected.size === 0}>
            Export selected
          </button>
        </span>
      </h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        Pick questions worth sending before scoping. Selections persist in your browser.
      </div>
      <input
        type="search"
        placeholder="Filter questions…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {grouped.map(([cat, list]) => (
        <div key={cat} className="model-section">
          <h4 style={{ margin: "0 0 6px", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {cat}
          </h4>
          <div className="define-list">
            {list.map((q) => (
              <label key={q.id} className={`define-list-item ${selected.has(q.id) ? "selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggle(q.id)}
                />
                <span className="define-list-item-name">{q.text}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

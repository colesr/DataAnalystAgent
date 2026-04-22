"use client";

import { useMemo, useState } from "react";

type Metric = {
  id: string;
  category: string;
  name: string;
  formula: string;
  desc: string;
};

const METRICS: Metric[] = [
  // Growth
  { id: "g1", category: "Growth", name: "MoM growth rate", formula: "(this_month - last_month) / last_month", desc: "Percent change month over month." },
  { id: "g2", category: "Growth", name: "YoY growth rate", formula: "(this_year - last_year) / last_year", desc: "Percent change year over year. Removes seasonality." },
  { id: "g3", category: "Growth", name: "CAGR", formula: "(end / start)^(1/years) - 1", desc: "Compound annual growth rate over multi-year period." },

  // Retention / churn
  { id: "r1", category: "Retention", name: "Retention rate (period)", formula: "active_at_end / active_at_start", desc: "Share of cohort still active at period end. Excludes new signups." },
  { id: "r2", category: "Retention", name: "Customer churn rate", formula: "lost_customers / active_customers_at_start", desc: "Share lost during the period." },
  { id: "r3", category: "Retention", name: "Revenue churn rate", formula: "lost_recurring_revenue / starting_recurring_revenue", desc: "Often more meaningful than customer churn for B2B." },
  { id: "r4", category: "Retention", name: "Net revenue retention (NRR)", formula: "(starting_arr + expansion - downgrades - churn) / starting_arr", desc: "Includes expansion. >100% means existing book grew." },
  { id: "r5", category: "Retention", name: "Day-N retention", formula: "users_active_on_day_N / users_active_on_day_0", desc: "Cohort retention curve. D1, D7, D30 are standard." },

  // Conversion
  { id: "c1", category: "Conversion", name: "Conversion rate", formula: "conversions / opportunities", desc: "Share of opportunities that converted." },
  { id: "c2", category: "Conversion", name: "Funnel step rate", formula: "step_N / step_(N-1)", desc: "Pass-through at each funnel step." },
  { id: "c3", category: "Conversion", name: "Lift", formula: "(treatment_rate - control_rate) / control_rate", desc: "Relative improvement of treatment over control." },

  // Revenue
  { id: "v1", category: "Revenue", name: "ARPU / ARPA", formula: "total_revenue / total_users (or accounts)", desc: "Average revenue per user / account." },
  { id: "v2", category: "Revenue", name: "LTV (simple)", formula: "ARPU × gross_margin / churn_rate", desc: "Estimated lifetime value of a customer." },
  { id: "v3", category: "Revenue", name: "CAC", formula: "(sales_spend + marketing_spend) / new_customers", desc: "Customer acquisition cost." },
  { id: "v4", category: "Revenue", name: "LTV/CAC ratio", formula: "LTV / CAC", desc: "Health metric for unit economics. >3 is healthy." },
  { id: "v5", category: "Revenue", name: "Gross margin", formula: "(revenue - cogs) / revenue", desc: "Share of revenue left after direct costs." },
  { id: "v6", category: "Revenue", name: "Payback period", formula: "CAC / monthly_gross_profit_per_customer", desc: "Months to recoup acquisition cost." },

  // Engagement
  { id: "e1", category: "Engagement", name: "DAU/MAU ratio", formula: "daily_active_users / monthly_active_users", desc: "Stickiness. Higher means users return more often." },
  { id: "e2", category: "Engagement", name: "Sessions per user", formula: "total_sessions / total_users", desc: "Frequency of use within a period." },
  { id: "e3", category: "Engagement", name: "Time to value", formula: "median time from signup to first key action", desc: "Speed of activation." },

  // Quality / NPS
  { id: "q1", category: "Quality", name: "NPS", formula: "% promoters (9-10) − % detractors (0-6)", desc: "Net Promoter Score, ranges -100 to +100." },
  { id: "q2", category: "Quality", name: "CSAT", formula: "(% rating 4 or 5) × 100", desc: "Customer Satisfaction Score on a 1-5 scale." },
  { id: "q3", category: "Quality", name: "First response time", formula: "median time from ticket open to first reply", desc: "Support responsiveness metric." },
  { id: "q4", category: "Quality", name: "P50 / P95 / P99 latency", formula: "percentile of request durations", desc: "Tail-latency view of system performance." },

  // Statistical
  { id: "x1", category: "Statistical", name: "Standard error of the mean", formula: "stddev / sqrt(n)", desc: "Uncertainty around an estimated mean." },
  { id: "x2", category: "Statistical", name: "95% confidence interval", formula: "mean ± 1.96 × SE", desc: "Range that contains the true mean 95% of the time." },
  { id: "x3", category: "Statistical", name: "Effect size (Cohen's d)", formula: "(mean_a - mean_b) / pooled_stddev", desc: "Magnitude of difference, scale-free." },
  { id: "x4", category: "Statistical", name: "Statistical power", formula: "P(reject H0 | H1 true)", desc: "Probability of detecting a real effect. Aim for ≥0.8." },
];

export function DefineMetrics() {
  const [filter, setFilter] = useState("");

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = q
      ? METRICS.filter((m) => `${m.category} ${m.name} ${m.formula} ${m.desc}`.toLowerCase().includes(q))
      : METRICS;
    const map = new Map<string, Metric[]>();
    for (const m of matches) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return Array.from(map.entries());
  }, [filter]);

  function copyToClipboard(m: Metric) {
    navigator.clipboard.writeText(`${m.name}: ${m.desc} Formula: ${m.formula}`);
  }

  return (
    <div className="card">
      <h3>Success-metric library</h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        Common KPIs grouped by category, with formulas. Click "Copy" to grab a metric for
        your glossary or brief.
      </div>
      <input
        type="search"
        placeholder="Filter metrics…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {grouped.length === 0 ? (
        <div className="muted">No matches.</div>
      ) : (
        grouped.map(([cat, list]) => (
          <div key={cat} className="model-section">
            <h4 style={{ margin: "0 0 6px", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {cat}
            </h4>
            <div className="define-list">
              {list.map((m) => (
                <div key={m.id} className="define-list-item">
                  <div style={{ flex: 1 }}>
                    <div className="define-list-item-name">{m.name}</div>
                    <div className="define-list-item-desc">{m.desc}</div>
                    <div className="define-list-item-desc">
                      <code style={{ fontSize: 10 }}>{m.formula}</code>
                    </div>
                  </div>
                  <button className="ghost tiny" onClick={() => copyToClipboard(m)} style={{ marginTop: 0 }}>
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

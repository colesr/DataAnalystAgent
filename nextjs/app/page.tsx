"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
          <select defaultValue="gemini:gemini-2.5-flash" style={{ marginBottom: 10 }}>
            <option value="gemini:gemini-2.5-flash">Gemini 2.5 Flash — free</option>
            <option value="claude:claude-sonnet-4-6">Claude Sonnet 4.6 — balanced</option>
            <option value="claude:claude-opus-4-6">Claude Opus 4.6 — most capable</option>
            <option value="claude:claude-haiku-4-5-20251001">Claude Haiku 4.5 — fastest</option>
          </select>
          <input type="password" placeholder="" />
          <div className="muted" style={{ marginTop: 6 }}>
            Phase 1 — UI only. Backend wiring lands in phase 3.
          </div>
        </div>

        {/* Data card */}
        <div className="card">
          <h3>
            Data
            <span className="right">
              <button className="ghost tiny" onClick={noop}>
                Reset to demo
              </button>
              <button className="ghost tiny danger" onClick={noop}>
                Clear
              </button>
            </span>
          </h3>
          <label className="upload-zone">
            Drop a CSV / Excel file or click to browse
            <div className="muted" style={{ marginTop: 4 }}>
              Files append as new tables — load several to join across them
            </div>
            <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" multiple onChange={noop} />
          </label>
          <div className="muted" style={{ marginTop: 8 }}>
            (no files loaded)
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
                <button className="ghost tiny" onClick={noop}>
                  New conversation
                </button>
              </span>
            </h3>
            <textarea placeholder="e.g. Why did our retail margins drop in the Boston suburbs last month?" />
            <div style={{ marginTop: 6 }} />
            <button className="primary" onClick={noop}>
              Run analysis
            </button>
          </div>
        </section>

        {/* ============ DATA BROWSER ============ */}
        <section className="tab-panel" hidden={tab !== "data"}>
          <div className="card">
            <h3>
              Datasets <span className="badge">0 tables</span>
            </h3>
            <div className="muted" style={{ marginBottom: 8 }}>
              Pick a table to browse its rows. Click column headers to sort.
            </div>
            <div className="db-layout">
              <div className="db-tables">
                <div className="muted">No datasets loaded. Drop a CSV/Excel file at the top.</div>
              </div>
              <div className="db-main">
                <div className="db-toolbar">
                  <input type="search" placeholder="Filter rows…" disabled />
                  <span className="db-info" />
                  <span className="db-pager">
                    <button className="ghost" disabled>
                      ‹ Prev
                    </button>
                    <button className="ghost" disabled>
                      Next ›
                    </button>
                    <button className="ghost" disabled title="Download current table as CSV">
                      Export CSV
                    </button>
                  </span>
                </div>
                <div className="db-grid">
                  <div className="muted">Select a dataset on the left.</div>
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
                <button className="ghost tiny" onClick={noop}>Export CSV</button>
              </span>
            </h3>
            <textarea className="code" placeholder="SELECT * FROM ... LIMIT 50;" />
            <button className="primary" onClick={noop}>Run query</button>
            <button className="ghost" style={{ marginLeft: 6 }} onClick={noop}>
              Explain plan
            </button>
            <div className="tool-result" />
          </div>
          <div className="card">
            <h3>
              Query History <span className="badge">0</span>
            </h3>
            <div>
              <div className="muted">No queries yet.</div>
            </div>
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


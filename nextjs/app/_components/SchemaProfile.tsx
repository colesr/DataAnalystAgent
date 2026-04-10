"use client";

import { useEffect, useMemo, useState } from "react";

type DatasetMeta = {
  id: string;
  name: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
};

type SemanticType =
  | "id"
  | "integer"
  | "decimal"
  | "currency"
  | "percent"
  | "boolean"
  | "date"
  | "datetime"
  | "category"
  | "text"
  | "email"
  | "url"
  | "geo"
  | "json"
  | "unknown";

type ColumnProfile = {
  name: string;
  type: string;
  semantic: SemanticType;
  total: number;
  nonNull: number;
  distinct: number;
  nullPct: number;
  uniquePct: number;
  min?: string | null;
  max?: string | null;
  mean?: number | null;
  stddev?: number | null;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  histogram?: { bin: string; count: number }[];
  avgLen?: number | null;
  maxLen?: number | null;
  topValues?: { value: string; count: number }[];
};

type ProfileSummary = {
  columnCount: number;
  numericCount: number;
  timeCount: number;
  categoryCount: number;
  textCount: number;
  idCount: number;
  nullishCount: number;
};

type ProfileResponse = {
  name: string;
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  schemaText: string;
  summary: ProfileSummary;
};

const SEM_META: Record<SemanticType, { label: string; icon: string; cls: string }> = {
  id:       { label: "ID",       icon: "#",  cls: "sem-id" },
  integer:  { label: "Integer",  icon: "n",  cls: "sem-int" },
  decimal:  { label: "Decimal",  icon: "n.", cls: "sem-dec" },
  currency: { label: "Currency", icon: "$",  cls: "sem-cur" },
  percent:  { label: "Percent",  icon: "%",  cls: "sem-pct" },
  boolean:  { label: "Boolean",  icon: "T/F",cls: "sem-bool" },
  date:     { label: "Date",     icon: "📅", cls: "sem-date" },
  datetime: { label: "Datetime", icon: "🕒", cls: "sem-date" },
  category: { label: "Category", icon: "◎",  cls: "sem-cat" },
  text:     { label: "Text",     icon: "Aa", cls: "sem-text" },
  email:    { label: "Email",    icon: "@",  cls: "sem-email" },
  url:      { label: "URL",      icon: "↗",  cls: "sem-url" },
  geo:      { label: "Geo",      icon: "◉",  cls: "sem-geo" },
  json:     { label: "JSON",     icon: "{}", cls: "sem-json" },
  unknown:  { label: "Unknown",  icon: "?",  cls: "sem-unk" },
};

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "k";
  if (abs >= 100) return n.toFixed(0);
  if (abs === 0) return "0";
  return n.toFixed(digits);
}

function shortVal(s: string, max = 18): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function SchemaProfile({
  datasets,
  onError,
}: {
  datasets: DatasetMeta[];
  onError: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [filterSem, setFilterSem] = useState<SemanticType | "all">("all");
  const [showSchemaText, setShowSchemaText] = useState(false);

  useEffect(() => {
    if (!selected && datasets[0]) setSelected(datasets[0].id);
  }, [datasets, selected]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setProfile(null);
    fetch(`/api/datasets/${selected}/profile`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setProfile(data as ProfileResponse))
      .catch((e) => onError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [selected, onError]);

  const filteredCols = useMemo(() => {
    if (!profile) return [];
    const q = filter.trim().toLowerCase();
    return profile.columns.filter((c) => {
      if (filterSem !== "all" && c.semantic !== filterSem) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [profile, filter, filterSem]);

  if (datasets.length === 0) {
    return (
      <div className="card">
        <h3>Data Profile</h3>
        <div className="muted">Upload a CSV/Excel file to see its profile.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h3>
          Data Profile
          {profile && (
            <>
              <span className="badge">{profile.columns.length} columns</span>
              <span className="badge">{profile.rowCount.toLocaleString()} rows</span>
              <span className="right">
                <button
                  className="ghost tiny"
                  onClick={() => setShowSchemaText((v) => !v)}
                  title="Show the schema text sent to the agent"
                >
                  {showSchemaText ? "Hide" : "Show"} schema text
                </button>
              </span>
            </>
          )}
        </h3>

        <div className="profile-controls">
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            style={{ flex: "2 1 240px" }}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.rowCount.toLocaleString()} rows
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Filter columns…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: "2 1 160px" }}
          />
          <select
            value={filterSem}
            onChange={(e) => setFilterSem(e.target.value as SemanticType | "all")}
            style={{ flex: "1 1 120px" }}
          >
            <option value="all">All types</option>
            <option value="id">IDs</option>
            <option value="integer">Integers</option>
            <option value="decimal">Decimals</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
            <option value="boolean">Boolean</option>
            <option value="date">Date</option>
            <option value="datetime">Datetime</option>
            <option value="category">Category</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="url">URL</option>
            <option value="geo">Geo</option>
            <option value="json">JSON</option>
          </select>
        </div>

        {loading && <div className="muted" style={{ marginTop: 8 }}>Loading profile…</div>}

        {profile && (
          <>
            <div className="profile-summary">
              <SummaryTile label="Columns" value={profile.summary.columnCount} kind="all" />
              <SummaryTile label="Numeric" value={profile.summary.numericCount} kind="num" />
              <SummaryTile label="Time"    value={profile.summary.timeCount}    kind="time" />
              <SummaryTile label="Category" value={profile.summary.categoryCount} kind="cat" />
              <SummaryTile label="Text"    value={profile.summary.textCount}    kind="text" />
              <SummaryTile label="IDs"     value={profile.summary.idCount}      kind="id" />
              <SummaryTile label="Has nulls" value={profile.summary.nullishCount} kind="null" />
            </div>

            <div className="profile-grid">
              {filteredCols.map((c) => (
                <ColumnCard key={c.name} col={c} />
              ))}
              {filteredCols.length === 0 && (
                <div className="muted" style={{ padding: 12 }}>No columns match your filter.</div>
              )}
            </div>
          </>
        )}
      </div>

      {profile && showSchemaText && (
        <div className="card">
          <h3>Schema Text (sent to agent)</h3>
          <pre className="schema-text-box">{profile.schemaText}</pre>
        </div>
      )}
    </>
  );
}

function SummaryTile({ label, value, kind }: { label: string; value: number; kind: string }) {
  return (
    <div className={`summary-tile sum-${kind}`}>
      <div className="sum-val">{value}</div>
      <div className="sum-lbl">{label}</div>
    </div>
  );
}

function ColumnCard({ col: c }: { col: ColumnProfile }) {
  const sem = SEM_META[c.semantic] ?? SEM_META.unknown;
  const fillPct = c.total > 0 ? (c.nonNull / c.total) * 100 : 0;
  const isPK = c.distinct === c.total && c.total > 0;
  const isNumeric = c.histogram && c.histogram.length > 0 && c.mean != null;
  const maxBin = c.histogram ? Math.max(1, ...c.histogram.map((b) => b.count)) : 1;

  return (
    <div className={`profile-col ${sem.cls}`}>
      <div className="pc-head">
        <span className="sem-icon" title={sem.label}>{sem.icon}</span>
        <span className="pc-name" title={c.name}>{c.name}</span>
        <span className="pc-type" title={c.type}>{sem.label}</span>
      </div>

      {/* fill bar (segmented: filled + null) */}
      <div className="fill-row">
        <div className="fill-bar" title={`${c.nonNull.toLocaleString()} non-null / ${c.total.toLocaleString()} rows`}>
          <div className="fill-filled" style={{ width: `${fillPct}%` }} />
          <div className="fill-null" style={{ width: `${100 - fillPct}%` }} />
        </div>
        <div className="fill-pct">{fillPct.toFixed(0)}%</div>
      </div>

      <div className="pc-stats">
        <div><span className="k">distinct</span><span className="v">{c.distinct.toLocaleString()}</span></div>
        <div><span className="k">nulls</span><span className={`v ${c.nullPct > 0 ? "v-warn" : ""}`}>{c.nullPct.toFixed(0)}%</span></div>
      </div>

      {/* Numeric: histogram + quantile box */}
      {isNumeric && c.histogram && (
        <div className="hist-block">
          <div className="hist-bars" title="Distribution (10 bins)">
            {c.histogram.map((b, i) => {
              const h = (b.count / maxBin) * 100;
              return (
                <div
                  key={i}
                  className="hist-bar"
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`${b.bin}: ${b.count.toLocaleString()}`}
                />
              );
            })}
          </div>
          <div className="hist-axis">
            <span>{shortVal(String(c.min ?? ""), 10)}</span>
            <span>{shortVal(String(c.max ?? ""), 10)}</span>
          </div>
          <div className="num-stats">
            <div><span className="k">μ</span><span className="v">{fmtNum(c.mean)}</span></div>
            <div><span className="k">σ</span><span className="v">{fmtNum(c.stddev)}</span></div>
            <div><span className="k">med</span><span className="v">{fmtNum(c.median)}</span></div>
          </div>
        </div>
      )}

      {/* Time: histogram only */}
      {!isNumeric && c.histogram && c.histogram.length > 0 && (
        <div className="hist-block">
          <div className="hist-bars hist-time" title="Distribution over time">
            {c.histogram.map((b, i) => {
              const h = (b.count / maxBin) * 100;
              return (
                <div
                  key={i}
                  className="hist-bar"
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`${b.bin}: ${b.count.toLocaleString()}`}
                />
              );
            })}
          </div>
          <div className="hist-axis">
            <span>{shortVal(String(c.min ?? ""), 10)}</span>
            <span>{shortVal(String(c.max ?? ""), 10)}</span>
          </div>
        </div>
      )}

      {/* Min/max for non-histogram time/numeric */}
      {!c.histogram && c.min != null && (
        <div className="pc-stats">
          <div><span className="k">min</span><span className="v">{shortVal(String(c.min), 14)}</span></div>
          <div><span className="k">max</span><span className="v">{shortVal(String(c.max ?? ""), 14)}</span></div>
        </div>
      )}

      {/* String length stats */}
      {c.avgLen != null && c.maxLen != null && c.maxLen > 0 && (
        <div className="pc-stats">
          <div><span className="k">avg len</span><span className="v">{fmtNum(c.avgLen, 1)}</span></div>
          <div><span className="k">max len</span><span className="v">{c.maxLen}</span></div>
        </div>
      )}

      {/* Top values */}
      {c.topValues && c.topValues.length > 0 && (
        <div className="topvals">
          {c.topValues.map((tv, i) => {
            const pct = c.nonNull > 0 ? (tv.count / c.nonNull) * 100 : 0;
            return (
              <div key={i} className="topval-row" title={`${tv.value || "∅"}: ${tv.count.toLocaleString()} (${pct.toFixed(1)}%)`}>
                <div className="topval-bar" style={{ width: `${pct}%` }} />
                <div className="topval-text">
                  <span className="topval-name">{tv.value || "∅"}</span>
                  <span className="topval-pct">{pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pc-flags">
        {isPK && <span className="flag key">unique</span>}
        {c.nullPct === 100 && <span className="flag err">all null</span>}
        {c.nullPct > 0 && c.nullPct < 100 && c.nullPct >= 25 && !isPK && (
          <span className="flag warn">{c.nullPct.toFixed(0)}% null</span>
        )}
        {c.distinct === 1 && c.nonNull > 0 && <span className="flag warn">constant</span>}
      </div>
    </div>
  );
}

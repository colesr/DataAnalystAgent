import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { analyses } from "@/lib/schema";
import { notFound } from "next/navigation";
import Link from "next/link";

type ChartSpec = {
  type: "bar" | "line" | "pie" | "doughnut" | "scatter";
  title: string;
  labels: (string | number)[];
  datasets: { label: string; data: number[] }[];
};

type ReportPayload = {
  text?: string;
  charts?: ChartSpec[];
  model?: string;
};

export const dynamic = "force-dynamic";

export default async function ShareView({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [row] = await db
    .select({
      name: analyses.name,
      question: analyses.question,
      report: analyses.report,
      updatedAt: analyses.updatedAt,
    })
    .from(analyses)
    .where(eq(analyses.shareToken, token))
    .limit(1);

  if (!row) notFound();

  const report = (row.report ?? {}) as ReportPayload;
  const charts = report.charts ?? [];

  return (
    <div className="container">
      <header>
        <h1>{row.name}</h1>
      </header>

      <div className="card">
        <h3>Question</h3>
        <div style={{ fontSize: 13 }}>{row.question}</div>
      </div>

      {report.text && (
        <div id="report" className="card">
          <h3>Final Report</h3>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55 }}>
            {report.text}
          </div>
          {charts.length > 0 && (
            <>
              <h4>Charts</h4>
              <div className="charts-grid">
                {charts.map((c, i) => (
                  <SimpleChart key={i} spec={c} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="muted" style={{ marginTop: 12 }}>
        Updated {new Date(row.updatedAt).toLocaleString()} ·{" "}
        {report.model ? `model: ${report.model} · ` : ""}
        <Link href="/">Run your own analysis →</Link>
      </div>
    </div>
  );
}

function SimpleChart({ spec }: { spec: ChartSpec }) {
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
      <div
        className="chart-wrap"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
      >
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
                  <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
                );
              })()}
        </svg>
        <div className="muted" style={{ marginTop: 4, fontSize: 10 }}>
          {spec.type} · {ds.label} · {ds.data.length} pts
        </div>
      </div>
    );
  }
  return (
    <div
      className="chart-wrap"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
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

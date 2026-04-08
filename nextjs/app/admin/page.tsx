import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRuns, datasets, workspaces } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default async function AdminPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) {
    if (ADMIN_EMAILS.length === 0) {
      return (
        <div className="container">
          <header>
            <h1>Admin</h1>
          </header>
          <div className="card">
            <h3>Not configured</h3>
            <div className="muted">
              Set the <code>ADMIN_EMAILS</code> env var (comma-separated list) on Railway to allow
              specific signed-in accounts to view this page.
            </div>
          </div>
        </div>
      );
    }
    redirect("/api/auth/signin?callbackUrl=/admin");
  }

  // Aggregate workspace + dataset counts
  const wsCountRow = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM workspaces`
  )) as any[];
  const dsCountRow = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM datasets`
  )) as any[];
  const totals = {
    workspaces: Number(wsCountRow[0]?.n ?? 0),
    datasets: Number(dsCountRow[0]?.n ?? 0),
  };

  // Cost summary across all agent_runs (input/output tokens) — pricing applied
  // here is a rough average; the per-run cost the trace UI shows is more accurate.
  const costRow = (await db.execute(
    sql`SELECT
          COUNT(*)::int AS runs,
          COALESCE(SUM(input_tokens), 0)::bigint AS in_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS out_tokens,
          COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS errored
        FROM agent_runs`
  )) as any[];
  const usage = {
    runs: Number(costRow[0]?.runs ?? 0),
    inTokens: Number(costRow[0]?.in_tokens ?? 0),
    outTokens: Number(costRow[0]?.out_tokens ?? 0),
    errored: Number(costRow[0]?.errored ?? 0),
  };

  // Recent runs
  const recent = await db
    .select({
      id: agentRuns.id,
      model: agentRuns.model,
      question: agentRuns.question,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      durationMs: agentRuns.durationMs,
      error: agentRuns.error,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .orderBy(desc(agentRuns.createdAt))
    .limit(20);

  return (
    <div className="container">
      <header>
        <h1>Admin</h1>
      </header>

      <div className="card">
        <h3>Totals</h3>
        <div className="stat-grid">
          <div>
            <div className="lbl">Workspaces</div>
            <div className="val">{totals.workspaces.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Datasets</div>
            <div className="val">{totals.datasets.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Agent runs</div>
            <div className="val">{usage.runs.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Errored</div>
            <div className="val">{usage.errored.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Input tokens</div>
            <div className="val">{usage.inTokens.toLocaleString()}</div>
          </div>
          <div>
            <div className="lbl">Output tokens</div>
            <div className="val">{usage.outTokens.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Recent agent runs</h3>
        <table className="result-table">
          <thead>
            <tr>
              <th>when</th>
              <th>model</th>
              <th>question</th>
              <th>tokens (in / out)</th>
              <th>ms</th>
              <th>error</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.model}</td>
                <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.question.length > 60 ? r.question.slice(0, 60) + "…" : r.question}
                </td>
                <td>
                  {r.inputTokens.toLocaleString()} / {r.outputTokens.toLocaleString()}
                </td>
                <td>{r.durationMs}</td>
                <td style={{ color: "var(--err)" }}>{r.error ? r.error.slice(0, 60) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{ marginTop: 12 }}>
        <Link href="/">← back to app</Link>
      </div>
    </div>
  );
}

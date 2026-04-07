import Link from "next/link";

async function getHealth() {
  // Server component — runs at request time
  const checks: { name: string; status: "ok" | "warn" | "err"; detail: string }[] = [];

  // Database
  try {
    const { db } = await import("@/lib/db");
    await db.execute("select 1");
    checks.push({ name: "Database", status: "ok", detail: "Postgres connected" });
  } catch (e: any) {
    checks.push({
      name: "Database",
      status: "err",
      detail: e?.message ?? "Failed to connect — set DATABASE_URL",
    });
  }

  // Auth secret
  checks.push({
    name: "AUTH_SECRET",
    status: process.env.AUTH_SECRET ? "ok" : "err",
    detail: process.env.AUTH_SECRET ? "set" : "missing",
  });

  // Google OAuth
  checks.push({
    name: "Google OAuth",
    status: process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? "ok" : "warn",
    detail:
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
        ? "configured"
        : "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not set",
  });

  // AI providers
  checks.push({
    name: "Anthropic",
    status: process.env.ANTHROPIC_API_KEY ? "ok" : "warn",
    detail: process.env.ANTHROPIC_API_KEY ? "server key set" : "no server key (BYOK only)",
  });
  checks.push({
    name: "Gemini",
    status: process.env.GEMINI_API_KEY ? "ok" : "warn",
    detail: process.env.GEMINI_API_KEY ? "server key set" : "no server key (BYOK only)",
  });

  return checks;
}

export default async function Home() {
  const checks = await getHealth();

  return (
    <div className="container">
      <header>
        <h1>Digital Data Analyst</h1>
        <div className="muted">v2 · Next.js · Phase 0</div>
      </header>

      <div className="card">
        <h3>System Status</h3>
        {checks.map((c) => (
          <div key={c.name} className="status-row">
            <span className={`dot ${c.status}`} />
            <strong style={{ width: 130 }}>{c.name}</strong>
            <span className="muted">{c.detail}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>What this is</h3>
        <p>
          This is the Phase 0 scaffold of the Next.js + Postgres + Railway version of Digital Data Analyst.
          The current static HTML version is at <code>../index.html</code> and remains the source of truth
          for all features until the port catches up.
        </p>
        <p>
          <strong>Current status:</strong> deploys to Railway, connects to Postgres, has the auth scaffolding
          in place. None of the analyst tools are ported yet — that&apos;s Phase 1 onwards.
        </p>
      </div>

      <div className="card">
        <h3>Next phases</h3>
        <ul>
          <li><strong>Phase 1</strong> — Port the static UI (header, tabs, cards) to React. Visual parity, no backend.</li>
          <li><strong>Phase 2</strong> — Move data to Postgres. Per-user schemas, server-side query API.</li>
          <li><strong>Phase 3</strong> — Server-side AI agent. Streaming. Move keys to env vars.</li>
          <li><strong>Phase 4</strong> — Sharing, scheduled refreshes, alerts.</li>
        </ul>
      </div>

      <div className="card">
        <h3>Quick links</h3>
        <p>
          <Link href="/api/health">/api/health</Link> · health check JSON endpoint
          <br />
          <Link href="/api/auth/signin">/api/auth/signin</Link> · sign in (configure Google OAuth first)
        </p>
      </div>
    </div>
  );
}

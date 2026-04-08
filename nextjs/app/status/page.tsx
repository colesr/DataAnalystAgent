import Link from "next/link";

async function getHealth() {
  const checks: { name: string; status: "ok" | "warn" | "err"; detail: string }[] = [];

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

  checks.push({
    name: "AUTH_SECRET",
    status: process.env.AUTH_SECRET ? "ok" : "err",
    detail: process.env.AUTH_SECRET ? "set" : "missing",
  });

  checks.push({
    name: "Google OAuth",
    status: process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? "ok" : "warn",
    detail:
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
        ? "configured"
        : "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not set",
  });

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

export default async function StatusPage() {
  const checks = await getHealth();

  return (
    <div className="container">
      <header>
        <h1>Digital Data Analyst — Status</h1>
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
        <h3>Quick links</h3>
        <p>
          <Link href="/">/</Link> · main app
          <br />
          <Link href="/api/health">/api/health</Link> · health check JSON endpoint
          <br />
          <Link href="/api/auth/signin">/api/auth/signin</Link> · sign in
        </p>
      </div>
    </div>
  );
}


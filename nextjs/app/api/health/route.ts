import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = {
    status: "ok",
    time: new Date().toISOString(),
    node: process.version,
    env: {
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      DATABASE_URL: !!process.env.DATABASE_URL,
      AUTH_GOOGLE_ID: !!process.env.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: !!process.env.AUTH_GOOGLE_SECRET,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    },
  };

  try {
    const { db } = await import("@/lib/db");
    await db.execute("select 1");
    result.database = "connected";
  } catch (e: any) {
    result.database = "error: " + (e?.message ?? "unknown");
    result.status = "degraded";
  }

  // Check NextAuth auth() — this is where most current 500s seem to originate.
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    result.auth = session?.user ? `user:${(session.user as any).email}` : "anonymous";
  } catch (e: any) {
    result.auth = "error: " + (e?.message ?? "unknown");
    if (e?.stack) result.authStack = String(e.stack).split("\n").slice(0, 3).join(" | ");
    result.status = "degraded";
  }

  // Check workspace creation — the second hop that 500s if cookies/db go wrong.
  try {
    const { getOrCreateWorkspace } = await import("@/lib/workspace");
    const ws = await getOrCreateWorkspace();
    result.workspace = `ok:${ws.id.slice(0, 8)}`;
  } catch (e: any) {
    result.workspace = "error: " + (e?.message ?? "unknown");
    if (e?.stack) result.workspaceStack = String(e.stack).split("\n").slice(0, 3).join(" | ");
    result.status = "degraded";
  }

  return NextResponse.json(result);
}

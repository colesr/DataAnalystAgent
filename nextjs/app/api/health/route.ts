import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = {
    status: "ok",
    time: new Date().toISOString(),
    node: process.version,
  };

  try {
    const { db } = await import("@/lib/db");
    await db.execute("select 1");
    result.database = "connected";
  } catch (e: any) {
    result.database = "error: " + (e?.message ?? "unknown");
    result.status = "degraded";
  }

  return NextResponse.json(result);
}

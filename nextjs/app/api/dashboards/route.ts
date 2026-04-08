import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  const ws = await getOrCreateWorkspace();
  const rows = await db
    .select()
    .from(dashboards)
    .where(eq(dashboards.workspaceId, ws.id))
    .orderBy(desc(dashboards.updatedAt));
  return NextResponse.json({ dashboards: rows });
}

export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const ws = await getOrCreateWorkspace();
  const [row] = await db
    .insert(dashboards)
    .values({ workspaceId: ws.id, name })
    .returning();
  return NextResponse.json(row);
}

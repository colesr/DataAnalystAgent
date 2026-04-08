import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { alerts } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  const ws = await getOrCreateWorkspace();
  const rows = await db.select().from(alerts).where(eq(alerts.workspaceId, ws.id));
  return NextResponse.json({ alerts: rows });
}

export async function POST(req: Request) {
  let body: {
    name?: string;
    sql?: string;
    threshold?: string;
    enabled?: boolean;
    notifyEmail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const sql = (body.sql ?? "").trim();
  const threshold = (body.threshold ?? "0").toString().trim();
  const notifyEmail = (body.notifyEmail ?? "").trim() || null;
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if (!sql) return NextResponse.json({ error: "Missing sql" }, { status: 400 });
  if (!/^\d+$/.test(threshold)) {
    return NextResponse.json(
      { error: "threshold must be a non-negative integer (alert fires when rows > threshold)" },
      { status: 400 }
    );
  }
  if (notifyEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(notifyEmail)) {
    return NextResponse.json({ error: "Invalid notifyEmail" }, { status: 400 });
  }

  const ws = await getOrCreateWorkspace();
  const [row] = await db
    .insert(alerts)
    .values({
      workspaceId: ws.id,
      name,
      sql,
      threshold,
      enabled: body.enabled ?? true,
      notifyEmail,
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ws = await getOrCreateWorkspace();
  await db
    .delete(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.workspaceId, ws.id)));
  return NextResponse.json({ ok: true });
}

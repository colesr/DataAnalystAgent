import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { analyses } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

/** GET /api/analyses — list saved analyses for the current workspace. */
export async function GET() {
  const ws = await getOrCreateWorkspace();
  const rows = await db
    .select({
      id: analyses.id,
      name: analyses.name,
      question: analyses.question,
      shareToken: analyses.shareToken,
      createdAt: analyses.createdAt,
      updatedAt: analyses.updatedAt,
    })
    .from(analyses)
    .where(eq(analyses.workspaceId, ws.id))
    .orderBy(desc(analyses.updatedAt));
  return NextResponse.json({ analyses: rows });
}

/** POST /api/analyses — create a new saved analysis. */
export async function POST(req: Request) {
  let body: { name?: string; question?: string; report?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const question = (body.question ?? "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });
  if (!body.report) return NextResponse.json({ error: "Missing report" }, { status: 400 });

  const ws = await getOrCreateWorkspace();
  const [row] = await db
    .insert(analyses)
    .values({
      workspaceId: ws.id,
      name,
      question,
      report: body.report as any,
    })
    .returning();
  return NextResponse.json(row);
}

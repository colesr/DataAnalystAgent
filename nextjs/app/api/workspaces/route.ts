import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { createWorkspaceForUser } from "@/lib/workspace";

export const runtime = "nodejs";

/** GET /api/workspaces — list workspaces the current user is a member of. */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ workspaces: [] });

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      schemaName: workspaces.schemaName,
      role: workspaceMembers.role,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaces.createdAt));

  return NextResponse.json({ workspaces: rows });
}

/** POST /api/workspaces — create a new workspace owned by the current user. */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim() || "Untitled";

  const ws = await createWorkspaceForUser(userId, name);
  return NextResponse.json(ws);
}

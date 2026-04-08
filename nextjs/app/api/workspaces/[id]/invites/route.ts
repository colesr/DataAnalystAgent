import { NextResponse } from "next/server";
import { and, eq, isNull, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { workspaceInvites } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { ForbiddenError, requireWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

/** GET /api/workspaces/[id]/invites — outstanding (unaccepted) invites. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspaceMember(id, "owner");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const rows = await db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, id), isNull(workspaceInvites.acceptedAt)))
    .orderBy(desc(workspaceInvites.createdAt));
  return NextResponse.json({ invites: rows });
}

/** POST /api/workspaces/[id]/invites — generate a new invite token. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let role: string;
  try {
    await requireWorkspaceMember(id, "owner");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const session = await auth();
  const userId = (session?.user as any)?.id as string;

  let body: { role?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  role = (body.role ?? "editor").trim();
  if (!["owner", "editor", "viewer"].includes(role)) role = "editor";
  const email = (body.email ?? "").trim() || null;

  const token = randomBytes(16).toString("base64url");
  const [row] = await db
    .insert(workspaceInvites)
    .values({
      token,
      workspaceId: id,
      role,
      email,
      createdBy: userId,
    })
    .returning();
  return NextResponse.json(row);
}

/** DELETE /api/workspaces/[id]/invites?token=... — revoke. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspaceMember(id, "owner");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  await db
    .delete(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, id), eq(workspaceInvites.token, token)));
  return NextResponse.json({ ok: true });
}

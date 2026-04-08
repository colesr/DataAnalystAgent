import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceInvites, workspaceMembers } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { setActiveWorkspaceCookie } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * POST /api/invites/[token]/accept
 *
 * Caller must be signed in. If the invite is email-locked, their email
 * must match. On success: insert workspace_members row, mark accepted,
 * set the active workspace cookie.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const userEmail = session?.user?.email?.toLowerCase();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  if (invite.email && invite.email.toLowerCase() !== userEmail) {
    return NextResponse.json({ error: "Invite is for a different email" }, { status: 403 });
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
      })
      .onConflictDoNothing();
    await tx
      .update(workspaceInvites)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(eq(workspaceInvites.token, token));
  });

  await setActiveWorkspaceCookie(invite.workspaceId);
  return NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
}

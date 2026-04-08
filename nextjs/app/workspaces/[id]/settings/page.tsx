import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { WorkspaceSettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=/workspaces/${id}/settings`);
  }

  // Lookup the workspace + the current user's role for it.
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!ws) notFound();

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId))
    )
    .limit(1);
  if (!membership) {
    return (
      <div className="container">
        <header>
          <h1>Forbidden</h1>
        </header>
        <div className="card">
          <h3>You're not a member of this workspace</h3>
          <div className="muted">
            Ask the workspace owner to invite you.{" "}
            <Link href="/">Back to app</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>{ws.name}</h1>
        <span className="muted">your role: {membership.role}</span>
      </header>
      <WorkspaceSettingsClient
        workspaceId={id}
        workspaceName={ws.name}
        myRole={membership.role as "owner" | "editor" | "viewer"}
      />
      <div className="muted" style={{ marginTop: 12 }}>
        <Link href="/">← back to app</Link>
      </div>
    </div>
  );
}

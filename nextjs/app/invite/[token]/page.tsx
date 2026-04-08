import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceInvites, workspaces } from "@/lib/schema";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { AcceptInviteButton } from "./client";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();
  const signedIn = !!session?.user;
  const userEmail = session?.user?.email?.toLowerCase();

  const [row] = await db
    .select({
      token: workspaceInvites.token,
      role: workspaceInvites.role,
      email: workspaceInvites.email,
      acceptedAt: workspaceInvites.acceptedAt,
      workspaceName: workspaces.name,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  return (
    <div className="container">
      <header>
        <h1>Workspace invite</h1>
      </header>

      {!row && (
        <div className="card">
          <h3>Invite not found</h3>
          <div className="muted">
            This link is invalid or was revoked. <Link href="/">Back to app</Link>.
          </div>
        </div>
      )}

      {row && row.acceptedAt && (
        <div className="card">
          <h3>Already used</h3>
          <div className="muted">
            This invite was already accepted. <Link href="/">Back to app</Link>.
          </div>
        </div>
      )}

      {row && !row.acceptedAt && (
        <div className="card">
          <h3>You've been invited to {row.workspaceName}</h3>
          <div className="muted" style={{ marginBottom: 12 }}>
            Role: <strong>{row.role}</strong>
            {row.email && (
              <>
                {" · "}
                Locked to <code>{row.email}</code>
              </>
            )}
          </div>

          {!signedIn ? (
            <a
              className="primary"
              href={`/api/auth/signin?callbackUrl=${encodeURIComponent(
                `/invite/${token}`
              )}`}
              style={{ display: "inline-block" }}
            >
              Sign in to accept
            </a>
          ) : row.email && row.email.toLowerCase() !== userEmail ? (
            <div className="muted" style={{ color: "var(--err)" }}>
              You're signed in as <code>{userEmail}</code> but this invite is for{" "}
              <code>{row.email}</code>.
            </div>
          ) : (
            <AcceptInviteButton token={token} />
          )}
        </div>
      )}
    </div>
  );
}

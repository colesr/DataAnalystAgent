import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { workspaces, workspaceMembers } from "./schema";
import { auth } from "./auth";

const ANON_COOKIE = "dda_ws"; // anonymous-fallback workspace id
const ACTIVE_COOKIE = "dda_active_ws"; // signed-in user's currently selected workspace
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type Workspace = typeof workspaces.$inferSelect;
export type Role = "owner" | "editor" | "viewer";

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/**
 * Resolve the workspace this request should operate against.
 *
 * Resolution order for SIGNED-IN users:
 *   1. dda_active_ws cookie → workspace they're a member of
 *   2. Anonymous workspace from dda_ws cookie → claim it (set userId + add owner member row)
 *   3. First workspace they're a member of
 *   4. Brand-new workspace (created here, they become the owner)
 *
 * For ANONYMOUS users:
 *   1. dda_ws cookie → return that workspace if it still exists
 *   2. Otherwise create a new anonymous workspace + set the cookie
 *
 * Replaces the older getOrCreateWorkspace which only knew about a single
 * workspace per user.
 */
export async function getActiveWorkspace(): Promise<Workspace> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const jar = await cookies();
  const cookieAnon = jar.get(ANON_COOKIE)?.value;
  const cookieActive = jar.get(ACTIVE_COOKIE)?.value;

  if (userId) {
    // 1. Active workspace cookie wins, if the user is actually a member.
    if (cookieActive) {
      const rows = await db
        .select({ ws: workspaces })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(
          and(eq(workspaceMembers.userId, userId), eq(workspaces.id, cookieActive))
        )
        .limit(1);
      if (rows[0]) return rows[0].ws;
    }

    // 2. Try to claim the anonymous-cookie workspace if it exists and is unowned.
    if (cookieAnon) {
      const [anonWs] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, cookieAnon))
        .limit(1);
      if (anonWs && anonWs.userId == null) {
        await db.transaction(async (tx) => {
          await tx.update(workspaces).set({ userId }).where(eq(workspaces.id, anonWs.id));
          await tx
            .insert(workspaceMembers)
            .values({ workspaceId: anonWs.id, userId, role: "owner" })
            .onConflictDoNothing();
        });
        // Forget the anon cookie now that the workspace is claimed.
        jar.delete(ANON_COOKIE);
        return { ...anonWs, userId };
      }
    }

    // 3. First workspace the user is a member of.
    const memberRows = await db
      .select({ ws: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
      .limit(1);
    if (memberRows[0]) return memberRows[0].ws;

    // 4. Create one — they're the owner.
    return await createWorkspaceForUser(userId, "Default");
  }

  // ---- Anonymous flow ----
  if (cookieAnon) {
    const [existing] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, cookieAnon))
      .limit(1);
    if (existing) return existing;
  }

  const ws = await createAnonymousWorkspace();
  jar.set(ANON_COOKIE, ws.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return ws;
}

/** Backwards-compat alias for the older name. */
export const getOrCreateWorkspace = getActiveWorkspace;

/**
 * Throw if the current user isn't a member of the given workspace with at
 * least `minRole`. Returns the user's role for further fine-grained checks.
 *
 * Anonymous users implicitly pass for the workspace stored in their
 * dda_ws cookie (everything in there is theirs).
 */
export async function requireWorkspaceMember(
  workspaceId: string,
  minRole: Role = "viewer"
): Promise<Role> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    const jar = await cookies();
    const cookieAnon = jar.get(ANON_COOKIE)?.value;
    if (cookieAnon === workspaceId) return "owner";
    throw new ForbiddenError("Not a member of this workspace");
  }

  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
    )
    .limit(1);
  if (!row) throw new ForbiddenError("Not a member of this workspace");

  const role = row.role as Role;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError(`Requires ${minRole} role (you are ${role})`);
  }
  return role;
}

/** Distinguish 403 from generic 500s in route handlers. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Switch the active workspace cookie. Caller must have already verified membership. */
export async function setActiveWorkspaceCookie(workspaceId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Create a new owned-by-user workspace + matching schema + owner member row.
 * Used for the "create workspace" API and the lazy-create branch above.
 */
export async function createWorkspaceForUser(
  userId: string,
  name: string
): Promise<Workspace> {
  const schemaName = makeSchemaName();
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workspaces)
      .values({ userId, schemaName, name })
      .returning();
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: row.id, userId, role: "owner" });
    return row;
  });
}

/** Anonymous workspace — no userId, no member row. */
async function createAnonymousWorkspace(): Promise<Workspace> {
  const schemaName = makeSchemaName();
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));
  const [row] = await db
    .insert(workspaces)
    .values({ userId: null, schemaName, name: "Default" })
    .returning();
  return row;
}

function makeSchemaName(): string {
  const shortId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `ws_${shortId}`;
}

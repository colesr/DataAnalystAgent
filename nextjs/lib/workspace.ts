import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { workspaces } from "./schema";
import { auth } from "./auth";

const COOKIE_NAME = "dda_ws";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type Workspace = typeof workspaces.$inferSelect;

/**
 * Resolve the current workspace, creating one if needed.
 *
 * Resolution order:
 *   1. If signed in, return the user's first workspace (creating it if missing).
 *   2. Otherwise, look up the anonymous workspace from the `dda_ws` cookie.
 *   3. Otherwise, create a brand new anonymous workspace and set the cookie.
 *
 * Each workspace gets its own Postgres schema (`ws_<short-id>`) which is
 * lazily created on first call.
 *
 * MUST be called from a route handler or server action — not from a
 * pure server component — because it may need to set a cookie.
 */
export async function getOrCreateWorkspace(): Promise<Workspace> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const jar = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value;

  if (userId) {
    // First: try to claim the cookie's anonymous workspace if there is one.
    // This carries any data the user uploaded pre-signin into their account.
    if (cookieVal) {
      const [cookieWs] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, cookieVal))
        .limit(1);
      if (cookieWs) {
        if (cookieWs.userId == null) {
          await db
            .update(workspaces)
            .set({ userId })
            .where(eq(workspaces.id, cookieWs.id));
          return { ...cookieWs, userId };
        }
        if (cookieWs.userId === userId) {
          return cookieWs;
        }
        // Cookie points at someone else's workspace — ignore it.
      }
    }

    // Otherwise: return the user's first workspace, creating one if needed.
    const existing = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0];

    return await createWorkspace(userId);
  }

  // Anonymous → look up by cookie, or create + set cookie.
  if (cookieVal) {
    const existing = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, cookieVal))
      .limit(1);
    if (existing[0]) return existing[0];
    // Cookie pointed at a workspace that no longer exists — fall through.
  }

  const ws = await createWorkspace(null);
  jar.set(COOKIE_NAME, ws.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return ws;
}

/**
 * Read-only variant for server components. Returns null if no workspace
 * exists yet — does NOT create one (cannot set cookies from RSC).
 */
export async function getCurrentWorkspace(): Promise<Workspace | null> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (userId) {
    const existing = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .limit(1);
    return existing[0] ?? null;
  }

  const jar = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value;
  if (!cookieVal) return null;

  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, cookieVal))
    .limit(1);
  return existing[0] ?? null;
}

/** Insert a new workspace row AND create its dedicated Postgres schema. */
async function createWorkspace(userId: string | null): Promise<Workspace> {
  // Generate a schema name we control end-to-end. Format: ws_<12 hex chars>.
  // The leading `ws_` ensures it never collides with reserved or auth tables.
  const shortId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const schemaName = `ws_${shortId}`;

  // CREATE SCHEMA first — if it fails, we don't want a dangling row.
  // schemaName is generated above from a UUID hex and a fixed prefix, so
  // it is guaranteed to match /^ws_[a-f0-9]{12}$/ and is safe to interpolate.
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));

  const [row] = await db
    .insert(workspaces)
    .values({ userId, schemaName, name: "Default" })
    .returning();
  return row;
}


import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * GET /api/me
 * Returns the current user (or null) and the active workspace id/name.
 * The header menu polls this on mount.
 */
export async function GET() {
  const session = await auth();
  const ws = await getOrCreateWorkspace();
  return NextResponse.json({
    user: session?.user ?? null,
    workspace: { id: ws.id, name: ws.name, schemaName: ws.schemaName, anonymous: ws.userId == null },
  });
}

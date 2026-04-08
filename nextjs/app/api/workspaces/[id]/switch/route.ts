import { NextResponse } from "next/server";
import {
  ForbiddenError,
  requireWorkspaceMember,
  setActiveWorkspaceCookie,
} from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * POST /api/workspaces/[id]/switch
 * Sets the dda_active_ws cookie if the caller is a member.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspaceMember(id, "viewer");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  await setActiveWorkspaceCookie(id);
  return NextResponse.json({ ok: true });
}

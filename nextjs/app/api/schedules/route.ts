import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { schedules, analyses } from "@/lib/schema";
import { getOrCreateWorkspace } from "@/lib/workspace";
import {
  isScheduleInterval,
  nextRunFrom,
  SCHEDULE_INTERVALS,
} from "@/lib/schedule-interval";

export const runtime = "nodejs";

export async function GET() {
  const ws = await getOrCreateWorkspace();
  const rows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.workspaceId, ws.id));
  return NextResponse.json({ schedules: rows, intervals: SCHEDULE_INTERVALS });
}

export async function POST(req: Request) {
  let body: { analysisId?: string; cron?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.analysisId) return NextResponse.json({ error: "Missing analysisId" }, { status: 400 });
  if (!body.cron || !isScheduleInterval(body.cron)) {
    return NextResponse.json(
      { error: `cron must be one of: ${SCHEDULE_INTERVALS.join(", ")}` },
      { status: 400 }
    );
  }

  const ws = await getOrCreateWorkspace();

  // Verify the analysis belongs to this workspace before linking.
  const [a] = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(and(eq(analyses.id, body.analysisId), eq(analyses.workspaceId, ws.id)))
    .limit(1);
  if (!a) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  const [row] = await db
    .insert(schedules)
    .values({
      workspaceId: ws.id,
      analysisId: body.analysisId,
      cron: body.cron,
      enabled: body.enabled ?? true,
      nextRunAt: nextRunFrom(new Date(), body.cron),
    })
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  // Bulk delete: ?analysisId=... drops all schedules tied to one analysis.
  // Otherwise expects ?id=... for a single schedule.
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const analysisId = url.searchParams.get("analysisId");
  const ws = await getOrCreateWorkspace();

  if (id) {
    await db
      .delete(schedules)
      .where(and(eq(schedules.id, id), eq(schedules.workspaceId, ws.id)));
    return NextResponse.json({ ok: true });
  }
  if (analysisId) {
    await db
      .delete(schedules)
      .where(
        and(eq(schedules.analysisId, analysisId), eq(schedules.workspaceId, ws.id))
      );
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Missing id or analysisId" }, { status: 400 });
}

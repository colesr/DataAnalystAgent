import { NextResponse } from "next/server";
import { and, eq, desc, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { schedules, analyses, workspaces, glossaryEntries, workspaceMemory } from "@/lib/schema";
import { runAndCollect } from "@/lib/agent";
import { isScheduleInterval, nextRunFrom } from "@/lib/schedule-interval";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 min — agent runs are slow

const DEFAULT_MODEL = process.env.DEFAULT_AGENT_MODEL ?? "claude:claude-sonnet-4-6";

/**
 * POST /api/schedules/run
 *
 * Cron-secret protected endpoint that runs every due schedule. Designed to
 * be hit by an external cron (e.g. Railway cron service) every minute:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/schedules/run
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await db
    .select({
      schedule: schedules,
      analysis: analyses,
      workspace: workspaces,
    })
    .from(schedules)
    .innerJoin(analyses, eq(schedules.analysisId, analyses.id))
    .innerJoin(workspaces, eq(analyses.workspaceId, workspaces.id))
    .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, now)));

  const ran: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of due) {
    const { schedule, analysis, workspace } = row;
    const interval = schedule.cron;
    if (!isScheduleInterval(interval)) {
      ran.push({ id: schedule.id, ok: false, error: `bad interval: ${interval}` });
      continue;
    }

    // Load glossary + memory for this workspace.
    const [gloss, memo] = await Promise.all([
      db
        .select({ name: glossaryEntries.name, definition: glossaryEntries.definition })
        .from(glossaryEntries)
        .where(eq(glossaryEntries.workspaceId, workspace.id)),
      db
        .select({ note: workspaceMemory.note })
        .from(workspaceMemory)
        .where(eq(workspaceMemory.workspaceId, workspace.id))
        .orderBy(desc(workspaceMemory.createdAt))
        .limit(5),
    ]);
    const parts: string[] = [];
    if (memo.length) {
      parts.push(
        `## Notes from previous runs in this workspace\n${memo
          .reverse()
          .map((m) => `- ${m.note}`)
          .join("\n")}`
      );
    }
    if (gloss.length) {
      parts.push(
        `## Metric glossary\n${gloss.map((g) => `- **${g.name}**: ${g.definition}`).join("\n")}`
      );
    }
    const extraSystem = parts.length ? parts.join("\n\n") : undefined;

    const prevReport = (analysis.report ?? {}) as { model?: string };
    const model = prevReport.model || DEFAULT_MODEL;

    try {
      const result = await runAndCollect({
        question: analysis.question,
        model,
        workspace: { id: workspace.id, schemaName: workspace.schemaName },
        extraSystem,
      });
      if (result.error) {
        ran.push({ id: schedule.id, ok: false, error: result.error });
      } else {
        await db
          .update(analyses)
          .set({
            report: { text: result.text, charts: result.charts, model: result.model },
            updatedAt: new Date(),
          })
          .where(eq(analyses.id, analysis.id));
        ran.push({ id: schedule.id, ok: true });
      }
    } catch (e: any) {
      ran.push({ id: schedule.id, ok: false, error: e?.message ?? String(e) });
    }

    // Always advance the schedule, even on failure — otherwise a broken
    // schedule would block the runner forever.
    await db
      .update(schedules)
      .set({
        lastRunAt: new Date(),
        nextRunAt: nextRunFrom(new Date(), interval),
      })
      .where(eq(schedules.id, schedule.id));
  }

  return NextResponse.json({ ran: ran.length, results: ran });
}

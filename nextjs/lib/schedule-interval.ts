/**
 * Phase 4 schedules use a tiny enum of preset intervals instead of full cron
 * expressions, so we can compute nextRunAt without pulling in cron-parser.
 */

export type ScheduleInterval = "hourly" | "daily" | "weekly";

export const SCHEDULE_INTERVALS: ScheduleInterval[] = ["hourly", "daily", "weekly"];

export function isScheduleInterval(s: string): s is ScheduleInterval {
  return SCHEDULE_INTERVALS.includes(s as ScheduleInterval);
}

export function nextRunFrom(from: Date, interval: ScheduleInterval): Date {
  const ms =
    interval === "hourly"
      ? 60 * 60 * 1000
      : interval === "daily"
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

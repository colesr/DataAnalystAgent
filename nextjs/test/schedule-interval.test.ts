import { describe, it, expect } from "vitest";
import {
  isScheduleInterval,
  nextRunFrom,
  SCHEDULE_INTERVALS,
} from "@/lib/schedule-interval";

describe("isScheduleInterval", () => {
  it("accepts the three preset intervals", () => {
    for (const i of SCHEDULE_INTERVALS) {
      expect(isScheduleInterval(i)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isScheduleInterval("monthly")).toBe(false);
    expect(isScheduleInterval("0 * * * *")).toBe(false);
    expect(isScheduleInterval("")).toBe(false);
  });
});

describe("nextRunFrom", () => {
  const base = new Date("2026-04-08T12:00:00.000Z");

  it("hourly = +1h", () => {
    expect(nextRunFrom(base, "hourly").toISOString()).toBe("2026-04-08T13:00:00.000Z");
  });

  it("daily = +24h", () => {
    expect(nextRunFrom(base, "daily").toISOString()).toBe("2026-04-09T12:00:00.000Z");
  });

  it("weekly = +7d", () => {
    expect(nextRunFrom(base, "weekly").toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });
});

import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to `limit` requests in a window", () => {
    const key = `t1-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const r = rateLimit(key, { limit: 5, windowSec: 60 });
      expect(r.ok).toBe(true);
    }
    const r = rateLimit(key, { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("uses independent buckets per key", () => {
    const a = `t2a-${Math.random()}`;
    const b = `t2b-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(a, { limit: 3, windowSec: 60 });
    expect(rateLimit(a, { limit: 3, windowSec: 60 }).ok).toBe(false);
    expect(rateLimit(b, { limit: 3, windowSec: 60 }).ok).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, clearRateLimitBuckets, rateLimitHeaders } from "./rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    clearRateLimitBuckets();
    vi.useRealTimers();
  });

  it("allows requests until the per-client limit is exceeded", () => {
    const request = new Request("http://localhost/api/recommend", {
      headers: { "x-forwarded-for": "203.0.113.10" }
    });

    expect(checkRateLimit(request, { namespace: "test", limit: 2, windowMs: 60000 })).toMatchObject({
      allowed: true,
      remaining: 1
    });
    expect(checkRateLimit(request, { namespace: "test", limit: 2, windowMs: 60000 })).toMatchObject({
      allowed: true,
      remaining: 0
    });
    expect(checkRateLimit(request, { namespace: "test", limit: 2, windowMs: 60000 })).toMatchObject({
      allowed: false,
      remaining: 0
    });
  });

  it("tracks clients and namespaces independently", () => {
    const firstClient = new Request("http://localhost/api/recommend", {
      headers: { "x-forwarded-for": "203.0.113.10" }
    });
    const secondClient = new Request("http://localhost/api/recommend", {
      headers: { "x-forwarded-for": "203.0.113.11" }
    });

    expect(checkRateLimit(firstClient, { namespace: "test", limit: 1, windowMs: 60000 }).allowed).toBe(true);
    expect(checkRateLimit(firstClient, { namespace: "test", limit: 1, windowMs: 60000 }).allowed).toBe(false);
    expect(checkRateLimit(secondClient, { namespace: "test", limit: 1, windowMs: 60000 }).allowed).toBe(true);
    expect(checkRateLimit(firstClient, { namespace: "other", limit: 1, windowMs: 60000 }).allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00Z"));
    const request = new Request("http://localhost/api/recommend");

    expect(checkRateLimit(request, { namespace: "test", limit: 1, windowMs: 1000 }).allowed).toBe(true);
    expect(checkRateLimit(request, { namespace: "test", limit: 1, windowMs: 1000 }).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-05-21T12:00:01Z"));

    expect(checkRateLimit(request, { namespace: "test", limit: 1, windowMs: 1000 }).allowed).toBe(true);
  });

  it("formats standard response headers", () => {
    const request = new Request("http://localhost/api/recommend");
    const result = checkRateLimit(request, { namespace: "test", limit: 2, windowMs: 60000 });

    expect(rateLimitHeaders(result)).toMatchObject({
      "Retry-After": expect.any(String),
      "X-RateLimit-Limit": "2",
      "X-RateLimit-Remaining": "1",
      "X-RateLimit-Reset": expect.any(String)
    });
  });
});

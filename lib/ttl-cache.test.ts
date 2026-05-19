import { describe, expect, it, vi } from "vitest";
import { getCached, stableCacheKey } from "./ttl-cache";

describe("getCached", () => {
  it("reuses a cached promise inside its ttl", async () => {
    const load = vi.fn().mockResolvedValue("value");

    await expect(getCached("ttl-test", "same", 1000, load)).resolves.toBe("value");
    await expect(getCached("ttl-test", "same", 1000, load)).resolves.toBe("value");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("removes failed loads from the cache", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce("ok");

    await expect(getCached("ttl-test-fail", "same", 1000, load)).rejects.toThrow("nope");
    await expect(getCached("ttl-test-fail", "same", 1000, load)).resolves.toBe("ok");

    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("stableCacheKey", () => {
  it("normalizes object key order", () => {
    expect(stableCacheKey({ b: 2, a: { d: 4, c: 3 } })).toBe(stableCacheKey({ a: { c: 3, d: 4 }, b: 2 }));
  });
});

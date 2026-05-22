type RateLimitOptions = {
  limit: number;
  namespace: string;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function checkRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const clientKey = getClientKey(request);
  const bucketKey = `${options.namespace}:${clientKey}`;
  const existing = buckets.get(bucketKey);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + options.windowMs
        };

  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, options.limit - bucket.count);

  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining,
    retryAfterSeconds,
    resetAt: bucket.resetAt
  };
}

export function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000))
  };
}

export function clearRateLimitBuckets() {
  buckets.clear();
}

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "local-client"
  );
}

function cleanupExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

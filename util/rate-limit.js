const StatusResponse = require("./statusresponse");

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function makeKey(req, mode) {
  const ip =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    "unknown";

  if (mode === "ip") return `ip:${ip}`;

  const bodyValue =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : typeof req.body?.userId === "string"
      ? req.body.userId.trim().toLowerCase()
      : "";
  if (bodyValue) return `ip:${ip}|body:${bodyValue}`;

  return `ip:${ip}`;
}

module.exports = function createRateLimiter(options = {}) {
  const max = parsePositiveInt(options.max, 30);
  const windowMs = parsePositiveInt(options.windowMs, 60 * 1000);
  const keyMode = options.keyMode || "ip";
  const message = options.message || "Too many requests";

  const seen = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = makeKey(req, keyMode);

    const current = seen.get(key);
    if (!current || current.resetAt <= now) {
      seen.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSec));
      return StatusResponse(res, 429, message);
    }

    if (seen.size > 5000) {
      for (const [k, v] of seen.entries()) {
        if (v.resetAt <= now) seen.delete(k);
      }
    }

    return next();
  };
};

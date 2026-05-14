const Crypto = require("crypto");
const { Op } = require("sequelize");

const Config = require("../config/wotlwedu");
const RateLimit = require("../model/ratelimit");
const database = require("./database");
const StatusResponse = require("./statusresponse");

const memoryCounters = new Map();

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getIp(req) {
  return (
    req.ip ||
    req.headers?.["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    "unknown"
  );
}

function makeKey(req, mode) {
  const ip = getIp(req);

  if (mode === "ip") return `ip:${ip}`;

  const bodyValue =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : typeof req.body?.userId === "string"
      ? req.body.userId.trim().toLowerCase()
      : typeof req.body?.linkToken === "string"
      ? req.body.linkToken.trim().toLowerCase()
      : typeof req.params?.inviteId === "string"
      ? req.params.inviteId.trim().toLowerCase()
      : "";
  if (bodyValue) return `ip:${ip}|body:${bodyValue}`;

  return `ip:${ip}`;
}

function makeScopedKey(scope, req, mode) {
  const normalizedScope = scope || req.baseUrl || req.originalUrl || "global";
  return `scope:${normalizedScope}|${makeKey(req, mode)}`;
}

function hashKey(value) {
  return Crypto.createHash("sha256").update(value).digest("hex");
}

function checkMemoryLimit(key, max, windowMs, now = Date.now()) {
  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    memoryCounters.set(key, next);
    return { limited: false, ...next };
  }

  current.count += 1;
  if (memoryCounters.size > 5000) {
    for (const [k, v] of memoryCounters.entries()) {
      if (v.resetAt <= now) memoryCounters.delete(k);
    }
  }

  return {
    limited: current.count > max,
    count: current.count,
    resetAt: current.resetAt,
  };
}

async function cleanupExpiredCounters(now) {
  if (Math.random() >= 0.01) return;
  await RateLimit.destroy({
    where: {
      resetAt: {
        [Op.lt]: new Date(now),
      },
    },
  });
}

async function checkDatabaseLimit(key, max, windowMs, now = Date.now(), retry = true) {
  const id = hashKey(key);
  const routeKey = key.length > 250 ? key.slice(0, 250) : key;

  await cleanupExpiredCounters(now);

  try {
    return await database.transaction(async (transaction) => {
      const current = await RateLimit.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!current || current.resetAt.getTime() <= now) {
        const resetAt = new Date(now + windowMs);
        if (current) {
          current.count = 1;
          current.resetAt = resetAt;
          current.routeKey = routeKey;
          await current.save({ transaction });
        } else {
          await RateLimit.create(
            {
              id,
              routeKey,
              count: 1,
              resetAt,
            },
            { transaction }
          );
        }
        return { limited: false, count: 1, resetAt: resetAt.getTime() };
      }

      current.count += 1;
      await current.save({ transaction });
      return {
        limited: current.count > max,
        count: current.count,
        resetAt: current.resetAt.getTime(),
      };
    });
  } catch (err) {
    if (retry && err.name === "SequelizeUniqueConstraintError") {
      return checkDatabaseLimit(key, max, windowMs, now, false);
    }
    throw err;
  }
}

module.exports = function createRateLimiter(options = {}) {
  const max = parsePositiveInt(options.max, 30);
  const windowMs = parsePositiveInt(options.windowMs, 60 * 1000);
  const keyMode = options.keyMode || "ip";
  const message = options.message || "Too many requests";
  const store = options.store || Config.rateLimitStore || "memory";
  const scope = options.scope || options.name || message;

  return async function rateLimit(req, res, next) {
    const now = Date.now();
    const key = makeScopedKey(scope, req, keyMode);

    try {
      const result =
        store === "database"
          ? await checkDatabaseLimit(key, max, windowMs, now)
          : checkMemoryLimit(key, max, windowMs, now);

      if (result.limited) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((result.resetAt - now) / 1000)
        );
        res.set("Retry-After", String(retryAfterSec));
        return StatusResponse(res, 429, message);
      }

      return next();
    } catch (err) {
      console.log("Rate limiter failed: " + err.message);
      if (Config.rateLimitFailOpen) return next();
      return StatusResponse(res, 503, "Rate limit unavailable");
    }
  };
};

module.exports._checkMemoryLimit = checkMemoryLimit;
module.exports._hashKey = hashKey;
module.exports._makeKey = makeKey;
module.exports._makeScopedKey = makeScopedKey;
module.exports._memoryCounters = memoryCounters;

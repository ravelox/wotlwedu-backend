const crypto = require("crypto");

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const normalized = value.toString().trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function hashValue(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function getIpAddress(req) {
  if (!req) return null;
  if (typeof req.ip === "string" && req.ip.trim()) return req.ip.trim();
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return normalizeString(req.connection?.remoteAddress);
}

function getUserAgent(req) {
  return normalizeString(req?.get?.("User-Agent")) || normalizeString(req?.headers?.["user-agent"]);
}

module.exports = {
  normalizeString,
  normalizeEmail,
  hashValue,
  randomToken,
  getIpAddress,
  getUserAgent,
};

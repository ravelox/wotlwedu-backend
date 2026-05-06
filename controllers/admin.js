const Config = require("../config/wotlwedu");
const StatusResponse = require("../util/statusresponse");

function normalizeConfigKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function isSensitiveConfigKey(key) {
  const normalized = normalizeConfigKey(key);
  return (
    normalized === "jwt_secret" ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_password") ||
    normalized.includes("api_key") ||
    normalized.includes("access_key") ||
    normalized.includes("private_key") ||
    normalized.includes("credential")
  );
}

function serializeConfigValue(value) {
  if (typeof value === "function") return "[function]";
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => serializeConfigValue(entry));
  if (value && typeof value === "object") {
    const serialized = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      serialized[key] = serializeConfigValue(nestedValue);
    }
    return serialized;
  }
  return value;
}

function redactConfig(config) {
  const redacted = {};
  for (const [key, value] of Object.entries(config)) {
    redacted[key] = isSensitiveConfigKey(key)
      ? "[redacted]"
      : serializeConfigValue(value);
  }
  return redacted;
}

function buildConfigSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    config: redactConfig(Config),
  };
}

exports.getConfig = (req, res) => {
  return StatusResponse(res, 200, "OK", buildConfigSnapshot());
};

exports._buildConfigSnapshot = buildConfigSnapshot;
exports._redactConfig = redactConfig;
exports._isSensitiveConfigKey = isSensitiveConfigKey;

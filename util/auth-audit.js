const UUID = require("./mini-uuid");
const AuthAudit = require("../model/authaudit");

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const normalized = value.toString().trim();
  return normalized.length > 0 ? normalized : null;
}

function safeStringify(metadata) {
  if (metadata === undefined || metadata === null) return null;
  try {
    return JSON.stringify(metadata);
  } catch (err) {
    return JSON.stringify({ serializationError: err.message });
  }
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

module.exports.log = async function logAuthAudit(event = {}, options = {}) {
  const transaction = options.transaction || null;
  const req = options.req || null;
  const actorUserId = normalizeString(
    event.actorUserId !== undefined ? event.actorUserId : req?.authUserId
  );

  return AuthAudit.create(
    {
      id: UUID("audit"),
      eventType: normalizeString(event.eventType) || "unknown",
      outcome: normalizeString(event.outcome) || "unknown",
      actorUserId,
      targetUserId: normalizeString(event.targetUserId),
      organizationId: normalizeString(event.organizationId),
      inviteId: normalizeString(event.inviteId),
      provider: normalizeString(event.provider),
      email: normalizeString(event.email),
      ipAddress: normalizeString(event.ipAddress) || getIpAddress(req),
      userAgent: normalizeString(event.userAgent) || normalizeString(req?.get?.("User-Agent")),
      message: normalizeString(event.message),
      metadata: safeStringify(event.metadata),
      creator: actorUserId || normalizeString(event.targetUserId) || "system",
    },
    transaction ? { transaction } : undefined
  );
};

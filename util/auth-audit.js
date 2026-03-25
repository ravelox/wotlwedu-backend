const UUID = require("./mini-uuid");
const AuthAudit = require("../model/authaudit");
const Config = require("../config/wotlwedu");

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

  const createdAudit = await AuthAudit.create(
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

  if (Config.authAuditStdout === true) {
    try {
      const payload =
        typeof createdAudit.get === "function"
          ? createdAudit.get({ plain: true })
          : createdAudit;
      console.log(
        JSON.stringify({
          type: "auth_audit",
          eventType: payload.eventType,
          outcome: payload.outcome,
          actorUserId: payload.actorUserId,
          targetUserId: payload.targetUserId,
          organizationId: payload.organizationId,
          inviteId: payload.inviteId,
          provider: payload.provider,
          email: payload.email,
          ipAddress: payload.ipAddress,
          createdAt: payload.createdAt,
          message: payload.message,
        })
      );
    } catch (err) {
      console.warn("Failed to emit auth audit log", err.message);
    }
  }

  return createdAudit;
};

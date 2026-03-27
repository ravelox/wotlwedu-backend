const UUID = require("./mini-uuid");
const AbuseAudit = require("../model/abuseaudit");
const { hashValue, getIpAddress, normalizeString } = require("./public-poll");

function safeStringify(metadata) {
  if (metadata === undefined || metadata === null) return null;
  try {
    return JSON.stringify(metadata);
  } catch (err) {
    return JSON.stringify({ serializationError: err.message });
  }
}

module.exports.log = async function logAbuseAudit(event = {}, options = {}) {
  const req = options.req || null;
  const actorUserId = normalizeString(event.actorUserId) || normalizeString(req?.authUserId);
  return AbuseAudit.create({
    id: UUID("abuse"),
    actorType: normalizeString(event.actorType) || (actorUserId ? "user" : "guest"),
    actorUserId,
    electionId: normalizeString(event.electionId),
    eventType: normalizeString(event.eventType) || "unknown",
    outcome: normalizeString(event.outcome) || "unknown",
    ipHash: hashValue(event.ipAddress || getIpAddress(req)),
    message: normalizeString(event.message),
    metadata: safeStringify(event.metadata),
    creator: actorUserId || "system",
  });
};

const { Op, Sequelize } = require("sequelize");

const StatusResponse = require("../util/statusresponse");
const AuthAudit = require("../model/authaudit");

function parseAuditMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeAudit(audit) {
  return {
    id: audit.id,
    eventType: audit.eventType,
    outcome: audit.outcome,
    actorUserId: audit.actorUserId,
    targetUserId: audit.targetUserId,
    organizationId: audit.organizationId,
    inviteId: audit.inviteId,
    provider: audit.provider,
    email: audit.email,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
    message: audit.message,
    metadata: parseAuditMetadata(audit.metadata),
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  };
}

function getSupportScope(req, requestedOrganizationId) {
  if (req.isAdmin === true) return requestedOrganizationId || null;
  if (req.isOrganizationAdmin === true && req.authOrganizationId) {
    return req.authOrganizationId;
  }
  return false;
}

function buildAuditWhere(req) {
  const scopedOrganizationId = getSupportScope(
    req,
    (req.query.organizationId || "").trim() || null
  );
  if (scopedOrganizationId === false) return { error: "Admin access required" };

  const where = {};
  if (scopedOrganizationId) where.organizationId = scopedOrganizationId;

  const eventType = (req.query.eventType || "").trim();
  const outcome = (req.query.outcome || "").trim();
  const provider = (req.query.provider || "").trim();
  const email = (req.query.email || "").trim().toLowerCase();
  const userId = (req.query.userId || "").trim();

  if (eventType) where.eventType = eventType;
  if (outcome) where.outcome = outcome;
  if (provider) where.provider = provider;
  if (email) where.email = email;
  if (userId) {
    where[Op.or] = [{ actorUserId: userId }, { targetUserId: userId }];
  }

  return { where, scopedOrganizationId };
}

function sortCountRows(rows) {
  return (rows || [])
    .map((row) => ({
      key: row.key || row.eventType || row.outcome || row.provider || "unknown",
      count: Number(row.count || 0),
    }))
    .sort((a, b) => b.count - a.count);
}

async function countDistinct(where, column) {
  return AuthAudit.count({
    where: {
      ...where,
      [column]: { [Op.ne]: null },
    },
    distinct: true,
    col: column,
  });
}

module.exports.getAuthAuditOverview = async (req, res, next) => {
  try {
    const built = buildAuditWhere(req);
    if (built.error) return StatusResponse(res, 403, built.error);

    let days = Number(req.query.days || 7);
    if (!Number.isFinite(days) || days <= 0) days = 7;
    if (days > 30) days = 30;

    const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const baseWhere = {
      ...built.where,
      createdAt: { [Op.gte]: createdAfter },
    };

    const [totalEvents, successCount, nonSuccessCount, uniqueActors, uniqueTargets] =
      await Promise.all([
        AuthAudit.count({ where: baseWhere }),
        AuthAudit.count({ where: { ...baseWhere, outcome: "success" } }),
        AuthAudit.count({ where: { ...baseWhere, outcome: { [Op.ne]: "success" } } }),
        countDistinct(baseWhere, "actorUserId"),
        countDistinct(baseWhere, "targetUserId"),
      ]);

    const [eventTypeRows, outcomeRows, providerRows, recentFailures] = await Promise.all([
      AuthAudit.findAll({
        attributes: ["eventType", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
        where: baseWhere,
        group: ["eventType"],
        raw: true,
      }),
      AuthAudit.findAll({
        attributes: ["outcome", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
        where: baseWhere,
        group: ["outcome"],
        raw: true,
      }),
      AuthAudit.findAll({
        attributes: ["provider", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
        where: {
          ...baseWhere,
          provider: { [Op.ne]: null },
        },
        group: ["provider"],
        raw: true,
      }),
      AuthAudit.findAll({
        where: { ...baseWhere, outcome: { [Op.ne]: "success" } },
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
    ]);

    return StatusResponse(res, 200, "OK", {
      windowDays: days,
      organizationId: built.scopedOrganizationId,
      totals: {
        totalEvents,
        successCount,
        nonSuccessCount,
        uniqueActors,
        uniqueTargets,
      },
      eventTypes: sortCountRows(eventTypeRows),
      outcomes: sortCountRows(outcomeRows),
      providers: sortCountRows(providerRows),
      recentFailures: (recentFailures || []).map(serializeAudit),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getAuthAuditFeed = async (req, res, next) => {
  try {
    const built = buildAuditWhere(req);
    if (built.error) return StatusResponse(res, 403, built.error);

    let page = Number(req.query.page || 1);
    let itemsPerPage = Number(req.query.items || 25);
    if (!Number.isFinite(page) || page <= 0) page = 1;
    if (!Number.isFinite(itemsPerPage) || itemsPerPage <= 0) itemsPerPage = 25;
    if (itemsPerPage > 100) itemsPerPage = 100;

    const { count, rows } = await AuthAudit.findAndCountAll({
      where: built.where,
      order: [["createdAt", "DESC"]],
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage,
    });

    return StatusResponse(res, 200, "OK", {
      total: count,
      page,
      itemsPerPage,
      organizationId: built.scopedOrganizationId,
      audits: (rows || []).map(serializeAudit),
    });
  } catch (err) {
    next(err);
  }
};

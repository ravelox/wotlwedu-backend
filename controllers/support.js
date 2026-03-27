const { Op, Sequelize } = require("sequelize");

const StatusResponse = require("../util/statusresponse");
const AuthAudit = require("../model/authaudit");
const AbuseAudit = require("../model/abuseaudit");
const Election = require("../model/election");
const Workgroup = require("../model/workgroup");

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

function serializePublicPollAudit(audit, context = {}) {
  const election = context.elections?.get(audit.electionId) || null;
  const workgroup = election?.workgroupId
    ? context.workgroups?.get(election.workgroupId) || null
    : null;

  return {
    id: audit.id,
    actorType: audit.actorType,
    actorUserId: audit.actorUserId,
    electionId: audit.electionId,
    eventType: audit.eventType,
    outcome: audit.outcome,
    ipHash: audit.ipHash,
    message: audit.message,
    metadata: parseAuditMetadata(audit.metadata),
    creator: audit.creator,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
    election: election
      ? {
          id: election.id,
          name: election.name,
          workgroupId: election.workgroupId,
          publicAccessMode: election.publicAccessMode,
          abuseStatus: election.abuseStatus,
        }
      : null,
    workgroup: workgroup
      ? {
          id: workgroup.id,
          name: workgroup.name,
          organizationId: workgroup.organizationId,
        }
      : null,
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

async function countDistinctForModel(Model, where, column) {
  return Model.count({
    where: {
      ...where,
      [column]: { [Op.ne]: null },
    },
    distinct: true,
    col: column,
  });
}

async function resolveScopedElectionIds(organizationId) {
  const workgroups = await Workgroup.findAll({
    where: { organizationId },
    attributes: ["id"],
    raw: true,
  });
  const workgroupIds = (workgroups || []).map((row) => row.id).filter(Boolean);
  if (!workgroupIds.length) return [];

  const elections = await Election.findAll({
    where: { workgroupId: { [Op.in]: workgroupIds } },
    attributes: ["id"],
    raw: true,
  });
  return (elections || []).map((row) => row.id).filter(Boolean);
}

async function buildPublicPollAuditWhere(req) {
  const scopedOrganizationId = getSupportScope(
    req,
    (req.query.organizationId || "").trim() || null
  );
  if (scopedOrganizationId === false) return { error: "Admin access required" };

  const where = {};
  const eventType = (req.query.eventType || "").trim();
  const outcome = (req.query.outcome || "").trim();
  const actorType = (req.query.actorType || "").trim();
  const userId = (req.query.userId || "").trim();
  const electionId = (req.query.electionId || "").trim();

  if (eventType) where.eventType = eventType;
  if (outcome) where.outcome = outcome;
  if (actorType) where.actorType = actorType;
  if (userId) where.actorUserId = userId;

  if (scopedOrganizationId) {
    const scopedElectionIds = await resolveScopedElectionIds(scopedOrganizationId);
    if (!scopedElectionIds.length) {
      where.electionId = "__none__";
    } else if (electionId) {
      where.electionId = scopedElectionIds.includes(electionId) ? electionId : "__none__";
    } else {
      where.electionId = { [Op.in]: scopedElectionIds };
    }
  } else if (electionId) {
    where.electionId = electionId;
  }

  return { where, scopedOrganizationId };
}

async function buildPublicPollAuditContext(audits) {
  const electionIds = [...new Set((audits || []).map((audit) => audit.electionId).filter(Boolean))];
  if (!electionIds.length) {
    return { elections: new Map(), workgroups: new Map() };
  }

  const elections = await Election.findAll({
    where: { id: { [Op.in]: electionIds } },
    attributes: ["id", "name", "workgroupId", "publicAccessMode", "abuseStatus"],
    raw: true,
  });

  const workgroupIds = [...new Set((elections || []).map((row) => row.workgroupId).filter(Boolean))];
  const workgroups = workgroupIds.length
    ? await Workgroup.findAll({
        where: { id: { [Op.in]: workgroupIds } },
        attributes: ["id", "name", "organizationId"],
        raw: true,
      })
    : [];

  return {
    elections: new Map((elections || []).map((row) => [row.id, row])),
    workgroups: new Map((workgroups || []).map((row) => [row.id, row])),
  };
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

module.exports.getPublicPollAbuseOverview = async (req, res, next) => {
  try {
    const built = await buildPublicPollAuditWhere(req);
    if (built.error) return StatusResponse(res, 403, built.error);

    let days = Number(req.query.days || 7);
    if (!Number.isFinite(days) || days <= 0) days = 7;
    if (days > 30) days = 30;

    const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const baseWhere = {
      ...built.where,
      createdAt: { [Op.gte]: createdAfter },
    };

    const [
      totalEvents,
      reportCount,
      blockedCount,
      uniqueActors,
      uniqueElections,
      eventTypeRows,
      outcomeRows,
      recentIncidents,
    ] = await Promise.all([
      AbuseAudit.count({ where: baseWhere }),
      AbuseAudit.count({ where: { ...baseWhere, eventType: "public_poll_reported" } }),
      AbuseAudit.count({
        where: {
          ...baseWhere,
          eventType: {
            [Op.in]: [
              "public_poll_invite_blocked_trust",
              "public_poll_invite_blocked_suppression",
            ],
          },
        },
      }),
      countDistinctForModel(AbuseAudit, baseWhere, "actorUserId"),
      countDistinctForModel(AbuseAudit, baseWhere, "electionId"),
      AbuseAudit.findAll({
        attributes: ["eventType", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
        where: baseWhere,
        group: ["eventType"],
        raw: true,
      }),
      AbuseAudit.findAll({
        attributes: ["outcome", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
        where: baseWhere,
        group: ["outcome"],
        raw: true,
      }),
      AbuseAudit.findAll({
        where: baseWhere,
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
    ]);

    const context = await buildPublicPollAuditContext(recentIncidents);

    return StatusResponse(res, 200, "OK", {
      windowDays: days,
      organizationId: built.scopedOrganizationId,
      totals: {
        totalEvents,
        reportCount,
        blockedCount,
        uniqueActors,
        uniqueElections,
      },
      eventTypes: sortCountRows(eventTypeRows),
      outcomes: sortCountRows(outcomeRows),
      recentIncidents: (recentIncidents || []).map((audit) =>
        serializePublicPollAudit(audit, context)
      ),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getPublicPollAbuseFeed = async (req, res, next) => {
  try {
    const built = await buildPublicPollAuditWhere(req);
    if (built.error) return StatusResponse(res, 403, built.error);

    let page = Number(req.query.page || 1);
    let itemsPerPage = Number(req.query.items || 25);
    if (!Number.isFinite(page) || page <= 0) page = 1;
    if (!Number.isFinite(itemsPerPage) || itemsPerPage <= 0) itemsPerPage = 25;
    if (itemsPerPage > 100) itemsPerPage = 100;

    const { count, rows } = await AbuseAudit.findAndCountAll({
      where: built.where,
      order: [["createdAt", "DESC"]],
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage,
    });
    const context = await buildPublicPollAuditContext(rows);

    return StatusResponse(res, 200, "OK", {
      total: count,
      page,
      itemsPerPage,
      organizationId: built.scopedOrganizationId,
      audits: (rows || []).map((audit) => serializePublicPollAudit(audit, context)),
    });
  } catch (err) {
    next(err);
  }
};

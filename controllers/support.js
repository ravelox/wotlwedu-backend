const { Op, Sequelize } = require("sequelize");

const StatusResponse = require("../util/statusresponse");
const Config = require("../config/wotlwedu");
const UUID = require("../util/mini-uuid");
const AbuseAuditLog = require("../util/abuse-audit");
const { hashValue, normalizeEmail } = require("../util/public-poll");
const AuthAudit = require("../model/authaudit");
const AuthAuditLog = require("../util/auth-audit");
const AbuseAudit = require("../model/abuseaudit");
const Election = require("../model/election");
const Workgroup = require("../model/workgroup");
const Organization = require("../model/organization");
const User = require("../model/user");
const Session = require("../model/session");
const Image = require("../model/image");
const Metadata = require("../model/metadata");
const ContactSuppression = require("../model/contactsuppression");
const BackupRestore = require("../util/backup-restore");
const Mailer = require("../util/mailer");

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

async function authorizeBackupScope(req, scope, organizationId, workgroupId) {
  if (scope === "system") {
    if (req.isAdmin !== true) return { error: "System admin access required" };
    return { organizationId: null, workgroupId: null };
  }

  if (scope === "organization") {
    const targetOrganizationId = organizationId || req.authOrganizationId;
    if (!targetOrganizationId) return { error: "No organization selected", status: 421 };
    if (req.isAdmin !== true && req.authOrganizationId !== targetOrganizationId) {
      return { error: "Not authorized for this organization" };
    }
    return { organizationId: targetOrganizationId, workgroupId: null };
  }

  if (scope === "space") {
    if (!workgroupId) return { error: "No space selected", status: 421 };
    const workgroup = await Workgroup.findByPk(workgroupId, { raw: true });
    if (!workgroup) return { error: "Space not found", status: 404 };
    if (req.isAdmin !== true && req.authOrganizationId !== workgroup.organizationId) {
      return { error: "Not authorized for this space" };
    }
    return { organizationId: workgroup.organizationId, workgroupId };
  }

  return { error: "Invalid backup scope", status: 421 };
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

function getPagination(query, defaultItems = 25, maxItems = 100) {
  let page = Number(query.page || 1);
  let itemsPerPage = Number(query.items || defaultItems);
  if (!Number.isFinite(page) || page <= 0) page = 1;
  if (!Number.isFinite(itemsPerPage) || itemsPerPage <= 0) itemsPerPage = defaultItems;
  if (itemsPerPage > maxItems) itemsPerPage = maxItems;
  return { page, itemsPerPage };
}

function toCsvValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => JSON.stringify(toCsvValue(row[header]))).join(",")
    ),
  ].join("\n");
}

async function getScopedUserIds(organizationId) {
  if (!organizationId) return null;
  const users = await User.findAll({
    where: { organizationId },
    attributes: ["id"],
    raw: true,
  });
  return (users || []).map((row) => row.id).filter(Boolean);
}

async function getScopedWorkgroupIds(organizationId) {
  if (!organizationId) return null;
  const workgroups = await Workgroup.findAll({
    where: { organizationId },
    attributes: ["id"],
    raw: true,
  });
  return (workgroups || []).map((row) => row.id).filter(Boolean);
}

async function getSupportUser(req, userId) {
  if (!userId) return { status: 421, message: "No user ID provided" };
  const user = await User.findByPk(userId);
  if (!user) return { status: 404, message: "User not found" };
  if (req.isAdmin !== true && req.authOrganizationId !== user.organizationId) {
    return { status: 403, message: "Not authorized for this user" };
  }
  if (req.isOrganizationAdmin !== true && req.isAdmin !== true) {
    return { status: 403, message: "Admin access required" };
  }
  if (user.protected === true) return { status: 421, message: "User is protected" };
  return { user };
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

    const { page, itemsPerPage } = getPagination(req.query);

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

module.exports.getAuthAuditExport = async (req, res, next) => {
  try {
    const built = buildAuditWhere(req);
    if (built.error) return StatusResponse(res, 403, built.error);

    const limit = Math.min(Number(req.query.limit || 5000) || 5000, 10000);
    const rows = await AuthAudit.findAll({
      where: built.where,
      order: [["createdAt", "DESC"]],
      limit,
    });
    const audits = (rows || []).map(serializeAudit);
    const headers = [
      "id",
      "createdAt",
      "eventType",
      "outcome",
      "actorUserId",
      "targetUserId",
      "organizationId",
      "provider",
      "email",
      "message",
    ];
    return StatusResponse(res, 200, "OK", {
      filename: "wotlwedu-auth-audit.csv",
      organizationId: built.scopedOrganizationId,
      total: audits.length,
      csv: buildCsv(audits, headers),
      audits,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getOpsOverview = async (req, res, next) => {
  try {
    if (req.isAdmin !== true && req.isOrganizationAdmin !== true) {
      return StatusResponse(res, 403, "Admin access required");
    }

    const scopedOrganizationId = getSupportScope(
      req,
      (req.query.organizationId || "").trim() || null
    );
    if (scopedOrganizationId === false) {
      return StatusResponse(res, 403, "Admin access required");
    }

    const now = new Date();
    const userWhere = {};
    const workgroupWhere = {};
    if (scopedOrganizationId) {
      userWhere.organizationId = scopedOrganizationId;
      workgroupWhere.organizationId = scopedOrganizationId;
    }

    const scopedUserIds = await getScopedUserIds(scopedOrganizationId);
    const scopedWorkgroupIds = await getScopedWorkgroupIds(scopedOrganizationId);
    const sessionWhere = scopedUserIds
      ? { userId: scopedUserIds.length ? { [Op.in]: scopedUserIds } : "__none__" }
      : {};
    const imageWhere = scopedOrganizationId
      ? {
          [Op.or]: [
            { creator: scopedUserIds?.length ? { [Op.in]: scopedUserIds } : "__none__" },
            { workgroupId: scopedWorkgroupIds?.length ? { [Op.in]: scopedWorkgroupIds } : "__none__" },
          ],
        }
      : {};

    const [
      organizationCount,
      userCount,
      workgroupCount,
      activeSessionCount,
      revokedSessionCount,
      imageCount,
      metadataRows,
      recentAuthFailures,
      recentMailFailures,
    ] = await Promise.all([
      scopedOrganizationId ? 1 : Organization.count(),
      User.count({ where: userWhere }),
      Workgroup.count({ where: workgroupWhere }),
      Session.count({
        where: {
          ...sessionWhere,
          revokedAt: null,
          expiresAt: { [Op.gt]: now },
        },
      }),
      Session.count({
        where: {
          ...sessionWhere,
          revokedAt: { [Op.ne]: null },
        },
      }),
      Image.count({ where: imageWhere }),
      Metadata.findAll({ order: [["name", "ASC"]], raw: true }),
      AuthAudit.count({
        where: {
          ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}),
          outcome: { [Op.ne]: "success" },
          createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      AuthAudit.count({
        where: {
          ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}),
          eventType: { [Op.like]: "%mail%" },
          outcome: { [Op.ne]: "success" },
          createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return StatusResponse(res, 200, "OK", {
      organizationId: scopedOrganizationId,
      tenancy: {
        organizations: organizationCount,
        users: userCount,
        workgroups: workgroupCount,
      },
      sessions: {
        active: activeSessionCount,
        revoked: revokedSessionCount,
      },
      auth: {
        recentFailures24h: recentAuthFailures,
      },
      mail: {
        provider: Config.mailerProvider?.name || Config.mailerProvider?.constructor?.name || "configured",
        fromAddress: Config.mailerFromAddress,
        recentFailures24h: recentMailFailures,
      },
      storage: {
        provider: Config.mediaStorageProvider,
        imageCount,
        publicBaseUrlConfigured: Boolean(Config.mediaStoragePublicBaseUrl),
        keyPrefix: Config.mediaStorageKeyPrefix || "",
        s3EndpointConfigured: Boolean(Config.s3Endpoint),
        s3BucketConfigured: Boolean(Config.s3Bucket),
      },
      updates: {
        count: metadataRows.length,
        rows: metadataRows.map((row) => ({
          name: row.name,
          value: row.value,
          comment: row.comment,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getBackup = async (req, res, next) => {
  try {
    if (req.isAdmin !== true && req.isOrganizationAdmin !== true) {
      return StatusResponse(res, 403, "Admin access required");
    }

    const scope = BackupRestore.normalizeScope(req.query.scope);
    const authorized = await authorizeBackupScope(
      req,
      scope,
      (req.query.organizationId || "").trim() || null,
      (req.query.workgroupId || "").trim() || null
    );
    if (authorized.error) {
      return StatusResponse(res, authorized.status || 403, authorized.error);
    }

    const backup = await BackupRestore.exportBackup({
      scope,
      organizationId: authorized.organizationId,
      workgroupId: authorized.workgroupId,
    });

    return StatusResponse(res, 200, "OK", { backup });
  } catch (err) {
    if (err.status) return StatusResponse(res, err.status, err.message);
    next(err);
  }
};

module.exports.postRestore = async (req, res, next) => {
  try {
    if (req.isAdmin !== true && req.isOrganizationAdmin !== true) {
      return StatusResponse(res, 403, "Admin access required");
    }

    const backup = req.body?.backup || req.body;
    const scope = BackupRestore.normalizeScope(backup?.scope);
    const authorized = await authorizeBackupScope(
      req,
      scope,
      backup?.organizationId || null,
      backup?.workgroupId || null
    );
    if (authorized.error) {
      return StatusResponse(res, authorized.status || 403, authorized.error);
    }

    const result = await BackupRestore.restoreBackup(backup, {
      mode: req.body?.mode || "upsert",
    });

    return StatusResponse(res, 200, "OK", { restore: result });
  } catch (err) {
    if (err.status) return StatusResponse(res, err.status, err.message);
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

    const { page, itemsPerPage } = getPagination(req.query);

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

module.exports.getPublicPollAbuseExport = async (req, res, next) => {
  try {
    const built = await buildPublicPollAuditWhere(req);
    if (built.error) return StatusResponse(res, 403, built.error);

    const limit = Math.min(Number(req.query.limit || 5000) || 5000, 10000);
    const rows = await AbuseAudit.findAll({
      where: built.where,
      order: [["createdAt", "DESC"]],
      limit,
    });
    const context = await buildPublicPollAuditContext(rows);
    const audits = (rows || []).map((audit) => serializePublicPollAudit(audit, context));
    const flatRows = audits.map((audit) => ({
      id: audit.id,
      createdAt: audit.createdAt,
      eventType: audit.eventType,
      outcome: audit.outcome,
      actorType: audit.actorType,
      actorUserId: audit.actorUserId,
      electionId: audit.electionId,
      electionName: audit.election?.name,
      organizationId: audit.workgroup?.organizationId,
      message: audit.message,
    }));
    const headers = [
      "id",
      "createdAt",
      "eventType",
      "outcome",
      "actorType",
      "actorUserId",
      "electionId",
      "electionName",
      "organizationId",
      "message",
    ];
    return StatusResponse(res, 200, "OK", {
      filename: "wotlwedu-public-poll-audit.csv",
      organizationId: built.scopedOrganizationId,
      total: audits.length,
      csv: buildCsv(flatRows, headers),
      audits,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postSupportPasswordReset = async (req, res, next) => {
  try {
    const found = await getSupportUser(req, req.params.userId);
    if (!found.user) return StatusResponse(res, found.status, found.message);

    const reason = (req.body?.reason || "").trim();
    if (!reason) return StatusResponse(res, 421, "Recovery reason is required");

    found.user.resetToken = UUID("wotlwedu");
    found.user.resetTokenExpire = Date.now() + 3600000;
    await found.user.save();

    const resetUrl = `${Config.baseFrontendUrl}/pwdreset/${found.user.id}/${found.user.resetToken}`;
    let emailSent = false;
    if (req.body?.sendEmail !== false) {
      await Mailer.sendPasswordResetMessage(
        found.user.email,
        found.user.id,
        found.user.resetToken,
        Config.baseFrontendUrl
      );
      emailSent = true;
    }

    await AuthAuditLog.log(
      {
        eventType: "support_password_reset",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: found.user.id,
        organizationId: found.user.organizationId,
        email: found.user.email,
        message: "Support generated account recovery password reset",
        metadata: { reason, emailSent },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      recovery: {
        userId: found.user.id,
        email: found.user.email,
        emailSent,
        resetUrl,
        expiresAt: found.user.resetTokenExpire,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postSupportClear2fa = async (req, res, next) => {
  try {
    const found = await getSupportUser(req, req.params.userId);
    if (!found.user) return StatusResponse(res, found.status, found.message);
    const reason = (req.body?.reason || "").trim();
    if (!reason) return StatusResponse(res, 421, "Recovery reason is required");

    found.user.enable2fa = false;
    found.user.secret2fa = null;
    found.user.token2fa = null;
    await found.user.save();

    await AuthAuditLog.log(
      {
        eventType: "support_clear_2fa",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: found.user.id,
        organizationId: found.user.organizationId,
        email: found.user.email,
        message: "Support cleared two-factor authentication",
        metadata: { reason },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      recovery: { userId: found.user.id, twoFactorEnabled: false },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postSupportVerifyUser = async (req, res, next) => {
  try {
    const found = await getSupportUser(req, req.params.userId);
    if (!found.user) return StatusResponse(res, found.status, found.message);
    const reason = (req.body?.reason || "").trim();
    if (!reason) return StatusResponse(res, 421, "Recovery reason is required");

    found.user.verified = true;
    found.user.active = true;
    found.user.registerToken = null;
    found.user.registerTokenExpire = null;
    await found.user.save();

    await AuthAuditLog.log(
      {
        eventType: "support_verify_account",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: found.user.id,
        organizationId: found.user.organizationId,
        email: found.user.email,
        message: "Support verified and activated account",
        metadata: { reason },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      recovery: { userId: found.user.id, verified: true, active: true },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postSuppressPublicPollRecipient = async (req, res, next) => {
  try {
    if (req.isAdmin !== true && req.isOrganizationAdmin !== true) {
      return StatusResponse(res, 403, "Admin access required");
    }
    const email = normalizeEmail(req.body?.email);
    const reason = (req.body?.reason || "").trim() || "support moderation";
    if (!email) return StatusResponse(res, 421, "No recipient email provided");

    const recipientHash = hashValue(email);
    const existing = await ContactSuppression.findOne({
      where: { channel: "email", recipientHash },
    });
    const suppression =
      existing ||
      (await ContactSuppression.create({
        id: UUID("suppression"),
        channel: "email",
        recipient: email,
        recipientHash,
        reason,
        creator: req.authUserId || null,
      }));

    if (existing) {
      existing.reason = reason;
      existing.creator = req.authUserId || existing.creator;
      await existing.save();
    }

    await AbuseAuditLog.log(
      {
        actorType: "user",
        actorUserId: req.authUserId,
        electionId: req.body?.electionId || null,
        eventType: "public_poll_recipient_suppressed",
        outcome: "success",
        message: "Recipient suppressed by support",
        metadata: { email, reason },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      suppression: {
        id: suppression.id,
        channel: suppression.channel,
        recipient: suppression.recipient,
        reason: suppression.reason,
      },
    });
  } catch (err) {
    next(err);
  }
};

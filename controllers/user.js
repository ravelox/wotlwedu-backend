const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize");
const Path = require("path");

const Config = require("../config/wotlwedu");
const UUID = require("../util/mini-uuid");
const Security = require("../util/security");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");
const {
  copyObject,
  bulkUpdate,
  getStatusIdByName,
} = require("../util/helpers");
const { normalizeOptionalId } = require("../util/idnormalize");
const OwnershipTransfer = require("../util/ownership-transfer");
const MediaStorage = require("../util/media-storage");

const User = require("../model/user");
const Friend = require("../model/friend");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");
const Image = require("../model/image");
const Organization = require("../model/organization");
const Notify = require("../util/notification");
const Status = require("../model/status");
const Notification = require("../model/notification");
const Role = require("../model/role");
const SocialIdentity = require("../model/socialidentity");
const AuthAudit = require("../model/authaudit");
const AuthAuditLog = require("../util/auth-audit");
const Session = require("../model/session");

const Attributes = require("../model/attributes");

const DEFAULT_ORGANIZATION_ID = "org_default";

async function getTargetOrganizationId(req) {
  if (req.isAdmin === true) {
    return req.body.organizationId || req.authOrganizationId || DEFAULT_ORGANIZATION_ID;
  }
  return req.authOrganizationId || null;
}

function generateIncludes(details) {
  const includes = [];
  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("friend")) {
      includes.push({
        model: Friend,
        attributes: ["statusId"],
        include: [
          { model: User, attributes: Attributes.Friend },
          { model: Status, attributes: Attributes.Status },
        ],
      });
    }
    if (splitDetail.includes("image")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
        "url",
      ]);
      includes.push({ model: Image, attributes: modImageAttributes });
    }
  }
  return includes;
}

function canAccessUserSupportData(req, targetUser) {
  if (!req || !targetUser) return false;
  if (req.isAdmin === true) return true;
  if (targetUser.id === req.authUserId) return true;
  if (!req.authOrganizationId) return false;
  if (targetUser.organizationId !== req.authOrganizationId) return false;
  return req.isOrganizationAdmin === true;
}

function serializeOwnershipPreview(sourceUserId, targetUserId, plan, includeLinked) {
  return {
    sourceUserId,
    targetUserId,
    includeLinked: !!includeLinked,
    resources: plan.resources || [],
    direct: plan.direct || {},
    linked: plan.linked || {},
  };
}

async function validateOwnershipTransferUsers(req, sourceUserId, targetUserId) {
  if (!sourceUserId) return { status: 421, message: "No source user ID provided" };
  if (!targetUserId) return { status: 421, message: "No target owner ID provided" };
  if (sourceUserId === targetUserId) {
    return { status: 421, message: "Source and target users must be different" };
  }

  const [sourceUser, targetUser] = await Promise.all([
    User.findByPk(sourceUserId),
    User.findByPk(targetUserId),
  ]);
  if (!sourceUser) return { status: 404, message: "Source user not found" };
  if (!targetUser) return { status: 404, message: "Target user not found" };
  if (sourceUser.protected === true) return { status: 421, message: "Source user is protected" };
  if (targetUser.protected === true) return { status: 421, message: "Target user is protected" };
  if (!targetUser.active) return { status: 421, message: "Target user must be active" };
  if (sourceUser.organizationId !== targetUser.organizationId) {
    return { status: 421, message: "Ownership transfers must stay within the same organization" };
  }
  if (!Security.isInSameOrganization(req, sourceUser))
    return { status: 403, message: "Cross-organization access denied" };
  if (!Security.isInSameOrganization(req, targetUser))
    return { status: 403, message: "Cross-organization access denied" };

  if (
    !Security.getVerdict(req.verdicts, "edit").isAdmin &&
    !Security.isOwner(req.authUserId, sourceUser)
  ) {
    return { status: 421, message: "Not owner" };
  }

  return { sourceUser, targetUser };
}

function parseAuditMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeSignInMethod(identity) {
  return {
    id: identity.id,
    provider: identity.provider,
    email: identity.email,
    subjectPreview: identity.subject
      ? `${identity.subject}`.slice(0, 6) + "..."
      : null,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
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

function serializeUserPrivacyProfile(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    alias: user.alias,
    imageId: user.imageId,
    organizationId: user.organizationId,
    active: user.active,
    verified: user.verified,
    enable2fa: user.enable2fa,
    organizationAdmin: user.organizationAdmin,
    workgroupAdmin: user.workgroupAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
  };
}

function serializeSessionForExport(row) {
  return {
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replayDetectedAt: row.replayDetectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeNotificationForExport(row) {
  return {
    id: row.id,
    type: row.type,
    objectId: row.objectId,
    text: row.text,
    senderId: row.senderId,
    statusId: row.statusId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

exports.getUser = async (req, res, next) => {
  const options = {};
  const userToFind = req.params.userId;

  // If the user ID wasn't in the Url, error out
  if (!userToFind) return StatusResponse(res, 400, "No user ID provided");

  let whereCondition = {};

  whereCondition.id = userToFind;
  whereCondition.protected = false;
  Security.applyOrganizationScope(req, whereCondition);
  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    if (userToFind !== req.authUserId) {
      whereCondition.creator = req.authUserId;
    }
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.UserFull;

  // Find the user in the table
  User.findOne(options)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");
      return StatusResponse(res, 200, "OK", { user: foundUser });
    })
    .catch((err) => next(err));
};

exports.getUserSignInMethods = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) return StatusResponse(res, 400, "No user ID provided");

    const foundUser = await User.findByPk(userId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    if (!canAccessUserSupportData(req, foundUser))
      return StatusResponse(res, 403, "Not authorized for this user");

    const identities = await SocialIdentity.findAll({
      where: { userId },
      order: [["provider", "ASC"]],
    });

    return StatusResponse(res, 200, "OK", {
      methods: {
        passwordEnabled: !!(foundUser.auth && foundUser.auth !== ""),
        linkedProviders: (identities || []).map(serializeSignInMethod),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteUserSignInMethod = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const identityId = req.params.identityId;
    if (!userId) return StatusResponse(res, 400, "No user ID provided");
    if (!identityId) return StatusResponse(res, 400, "No identity ID provided");

    const foundUser = await User.findByPk(userId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    if (!canAccessUserSupportData(req, foundUser))
      return StatusResponse(res, 403, "Not authorized for this user");

    const identity = await SocialIdentity.findOne({ where: { id: identityId, userId } });
    if (!identity) return StatusResponse(res, 404, "Linked sign-in method not found");

    const hasPassword = !!(foundUser.auth && foundUser.auth !== "");
    const identityCount = await SocialIdentity.count({ where: { userId } });
    if (!hasPassword && identityCount <= 1) {
      return StatusResponse(res, 421, "Cannot remove the last available sign-in method");
    }

    await identity.destroy();
    return StatusResponse(res, 200, "OK", {
      removed: serializeSignInMethod(identity),
    });
  } catch (err) {
    next(err);
  }
};

exports.getUserAuthAudit = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) return StatusResponse(res, 400, "No user ID provided");

    const foundUser = await User.findByPk(userId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    if (!canAccessUserSupportData(req, foundUser))
      return StatusResponse(res, 403, "Not authorized for this user");

    let page = +req.query.page || 1;
    let itemsPerPage = +req.query.items || 25;
    if (page <= 0) page = 1;
    if (itemsPerPage <= 0) itemsPerPage = 25;

    const where = {
      [Op.or]: [{ actorUserId: userId }, { targetUserId: userId }],
    };
    if (req.query.eventType) where.eventType = req.query.eventType;
    if (req.query.outcome) where.outcome = req.query.outcome;

    const { count, rows } = await AuthAudit.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage,
    });

    return StatusResponse(res, 200, "OK", {
      total: count,
      page,
      itemsPerPage,
      audits: (rows || []).map(serializeAudit),
    });
  } catch (err) {
    next(err);
  }
};

exports.getUserPrivacyExport = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) return StatusResponse(res, 400, "No user ID provided");

    const foundUser = await User.findByPk(userId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    if (!canAccessUserSupportData(req, foundUser)) {
      return StatusResponse(res, 403, "Not authorized for this user");
    }

    const memberships = await WorkgroupMember.findAll({
      where: { userId },
      order: [["createdAt", "ASC"]],
      raw: true,
    });
    const workgroupIds = memberships.map((membership) => membership.workgroupId).filter(Boolean);

    const [
      organization,
      workgroups,
      identities,
      audits,
      sessions,
      notifications,
    ] = await Promise.all([
      foundUser.organizationId ? Organization.findByPk(foundUser.organizationId, { raw: true }) : null,
      workgroupIds.length
        ? Workgroup.findAll({
            where: { id: { [Op.in]: workgroupIds } },
            attributes: ["id", "name", "description", "organizationId", "active", "createdAt", "updatedAt"],
            raw: true,
          })
        : [],
      SocialIdentity.findAll({ where: { userId }, order: [["provider", "ASC"]] }),
      AuthAudit.findAll({
        where: {
          [Op.or]: [{ actorUserId: userId }, { targetUserId: userId }],
        },
        order: [["createdAt", "DESC"]],
        limit: 500,
      }),
      Session.findAll({
        where: { userId },
        order: [["lastUsedAt", "DESC"]],
        limit: 100,
      }),
      Notification.findAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit: 500,
      }),
    ]);

    const workgroupById = new Map((workgroups || []).map((workgroup) => [workgroup.id, workgroup]));

    await AuthAuditLog.log(
      {
        eventType: "account_data_export",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: userId,
        organizationId: foundUser.organizationId,
        email: foundUser.email,
        message: "Account data export generated",
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      export: {
        exportedAt: new Date().toISOString(),
        account: serializeUserPrivacyProfile(foundUser),
        organization: organization
          ? {
              id: organization.id,
              name: organization.name,
              description: organization.description,
              active: organization.active,
              createdAt: organization.createdAt,
              updatedAt: organization.updatedAt,
            }
          : null,
        workgroups: memberships.map((membership) => ({
          id: membership.workgroupId,
          active: membership.active,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
          workgroup: workgroupById.get(membership.workgroupId) || null,
        })),
        signInMethods: {
          passwordEnabled: !!(foundUser.auth && foundUser.auth !== ""),
          linkedProviders: (identities || []).map(serializeSignInMethod),
        },
        sessions: (sessions || []).map(serializeSessionForExport),
        notifications: (notifications || []).map(serializeNotificationForExport),
        authAudits: (audits || []).map(serializeAudit),
        notes: [
          "Authentication secrets, password hashes, refresh token hashes, and two-factor secrets are excluded.",
          "Poll, list, item, and media content owned by an organization may require support review before deletion or transfer.",
        ],
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.postUserDeletionRequest = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) return StatusResponse(res, 400, "No user ID provided");

    const foundUser = await User.findByPk(userId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    if (!canAccessUserSupportData(req, foundUser)) {
      return StatusResponse(res, 403, "Not authorized for this user");
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    const requestedAt = new Date();
    await AuthAuditLog.log(
      {
        eventType: "account_deletion_requested",
        outcome: "pending",
        actorUserId: req.authUserId,
        targetUserId: userId,
        organizationId: foundUser.organizationId,
        email: foundUser.email,
        message: "Account deletion requested",
        metadata: {
          reason: reason || null,
          requestedBySelf: req.authUserId === userId,
          supportEmail: Config.supportEmail,
          retentionDeletedUserDays: Config.retentionDeletedUserDays,
        },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      deletionRequest: {
        userId,
        requestedAt,
        status: "pending_support_review",
        supportEmail: Config.supportEmail,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getOwnershipTransferPreview = async (req, res, next) => {
  try {
    const sourceUserId = req.params.userId;
    const targetUserId = req.query.ownerId || req.query.targetUserId;
    const includeLinked = req.query.includeLinked === "true";
    const resources = (req.query.resources || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const validated = await validateOwnershipTransferUsers(req, sourceUserId, targetUserId);
    if (!validated.sourceUser) {
      return StatusResponse(res, validated.status, validated.message);
    }

    const plan = await OwnershipTransfer.buildTransferPlan(
      validated.sourceUser.id,
      resources,
      includeLinked
    );

    return StatusResponse(res, 200, "OK", {
      transfer: serializeOwnershipPreview(
        validated.sourceUser.id,
        validated.targetUser.id,
        { ...plan, resources: OwnershipTransfer.normalizeResourceList(resources) },
        includeLinked
      ),
    });
  } catch (err) {
    next(err);
  }
};

exports.postOwnershipTransfer = async (req, res, next) => {
  try {
    const sourceUserId = req.params.userId;
    const targetUserId = req.body?.ownerId || req.body?.targetUserId;
    const includeLinked = req.body?.includeLinked === true;
    const resources = Array.isArray(req.body?.resources) ? req.body.resources : [];

    const validated = await validateOwnershipTransferUsers(req, sourceUserId, targetUserId);
    if (!validated.sourceUser) {
      return StatusResponse(res, validated.status, validated.message);
    }

    const result = await OwnershipTransfer.executeTransfer(
      validated.sourceUser.id,
      validated.targetUser.id,
      resources,
      includeLinked
    );

    await AuthAuditLog.log(
      {
        eventType: "support_ownership_transfer",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: validated.sourceUser.id,
        organizationId: validated.sourceUser.organizationId,
        message: "Support transferred resource ownership",
        metadata: {
          newOwnerId: validated.targetUser.id,
          includeLinked,
          resources: result.resources,
          changed: result.changed,
          reason: req.body?.reason || null,
        },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      transfer: {
        sourceUserId: validated.sourceUser.id,
        targetUserId: validated.targetUser.id,
        includeLinked,
        resources: result.resources,
        direct: result.direct,
        linked: result.linked,
        changed: result.changed,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getAllUser = async (req, res, next) => {
  try {
    let userFilter = req.query.filter;
    const workgroupId = normalizeOptionalId(req.query.workgroupId).value;
    const requestedOrganizationId = normalizeOptionalId(req.query.organizationId).value;
    let page = +req.query.page;
    let itemsPerPage = +req.query.items;
    if (!page) page = 1;
    if (page <= 0) page = 1;
    if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

    const options = {};

    options.limit = itemsPerPage;
    options.offset = (page - 1) * itemsPerPage;

    let whereCondition = { protected: false };
    if (userFilter) {
      whereCondition = {
        protected: false,
        [Op.or]: [
          { id: { [Op.like]: "%" + userFilter + "%" } },
          { firstName: { [Op.like]: "%" + userFilter + "%" } },
          { lastName: { [Op.like]: "%" + userFilter + "%" } },
          { email: { [Op.like]: "%" + userFilter + "%" } },
          { alias: { [Op.like]: "%" + userFilter + "%" } },
        ],
      };
    }

    if (requestedOrganizationId) {
      if (req.isAdmin !== true && req.authOrganizationId !== requestedOrganizationId) {
        return StatusResponse(res, 403, "Not authorized for this organization");
      }
      whereCondition.organizationId = requestedOrganizationId;
    } else if (req.authOrganizationId) {
      whereCondition.organizationId = req.authOrganizationId;
    }

    // Optional workgroup scoping: list users who are members of a given workgroup.
    // This is used by the browser console when a workgroup scope is selected.
    if (workgroupId) {
      if (req.isAdmin !== true) {
        const allowed = await Security.canAccessWorkgroup(req, workgroupId);
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
      }

      options.include = [
        {
          model: WorkgroupMember,
          attributes: [],
          where: { workgroupId: workgroupId },
          required: true,
        },
      ];
      options.distinct = true;
    } else if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
      // Legacy behavior: non-admins only see users they created.
      whereCondition.creator = req.authUserId;
    }

    const includes = generateIncludes(req.query.detail);

    // Sort order
    options.order = [["lastName"], ["firstName"]];
    options.where = whereCondition;
    options.include = (options.include || []).concat(includes);
    options.attributes = Attributes.UserFull;
    options.distinct = true;

    const { count, rows } = await User.findAndCountAll(options);
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        users: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      users: rows,
    });
  } catch (err) {
    return next(err);
  }
};

exports.putAddUser = async (req, res, next) => {
  try {
    // Populate the user properties from the form
    const userToAdd = new User();
    userToAdd.alias = req.body.alias;
    userToAdd.firstName = req.body.firstName;
    userToAdd.lastName = req.body.lastName;
    userToAdd.email = req.body.email;
    if (req.body.active) userToAdd.active = req.body.active === "on";
    if (req.body.admin || req.body.admin === false) {
      // Backward compatibility: admin input maps to system-admin behavior.
      userToAdd.systemAdmin = req.body.admin === true || req.body.admin === "on";
      userToAdd.admin = userToAdd.systemAdmin;
    }
    if (req.body.systemAdmin || req.body.systemAdmin === false) {
      userToAdd.systemAdmin =
        req.body.systemAdmin === true || req.body.systemAdmin === "on";
      userToAdd.admin = userToAdd.systemAdmin;
    }
    if (req.body.imageId) userToAdd.imageId = req.body.imageId;
    userToAdd.creator = req.authUserId;
    userToAdd.id = UUID("user");
    userToAdd.organizationId = await getTargetOrganizationId(req);

    if (!userToAdd.organizationId) {
      return StatusResponse(res, 421, "No organization context available");
    }

    if (userToAdd.systemAdmin === true && req.isAdmin !== true) {
      return StatusResponse(res, 403, "Only system admins can assign system admin");
    }

    if (req.body.organizationAdmin || req.body.organizationAdmin === false) {
      if (!req.isAdmin && req.isOrganizationAdmin !== true) {
        return StatusResponse(res, 403, "Not authorized to assign organization admin");
      }
      userToAdd.organizationAdmin = req.body.organizationAdmin;
    }
    if (req.body.workgroupAdmin || req.body.workgroupAdmin === false) {
      if (!req.isAdmin && req.isOrganizationAdmin !== true) {
        return StatusResponse(res, 403, "Not authorized to assign workgroup admin");
      }
      userToAdd.workgroupAdmin = req.body.workgroupAdmin;
    }
    if (req.body.adminWorkgroupId) userToAdd.adminWorkgroupId = req.body.adminWorkgroupId;
    // Backward compat input
    if (!userToAdd.adminWorkgroupId && req.body.adminGroupId) {
      userToAdd.adminWorkgroupId = req.body.adminGroupId;
    }

    const foundOrganization = await Organization.findByPk(userToAdd.organizationId);
    if (!foundOrganization) return StatusResponse(res, 421, "Organization not found");

    if (userToAdd.workgroupAdmin === true) {
      if (!userToAdd.adminWorkgroupId) {
        return StatusResponse(res, 421, "Workgroup admin requires adminWorkgroupId");
      }
      const adminWorkgroup = await Workgroup.findOne({
        where: { id: userToAdd.adminWorkgroupId, organizationId: userToAdd.organizationId },
      });
      if (!adminWorkgroup) {
        return StatusResponse(res, 421, "Invalid adminWorkgroupId for workgroup admin");
      }
    }

    // Check to see if the supplied email already exists
    User.findOne({ where: { email: userToAdd.email } })
      .then((foundUser) => {
        if (foundUser)
          return StatusResponse(res, 421, "Email address already exists");

        const defaultRoleName = Config.defaultRoleName || "Default Role";
        // Must add the user to a default role
        Role.findOne({ where: { name: defaultRoleName } })
          .then((foundRole) => {
            if (!foundRole)
              return StatusResponse(res, 421, "No default role is available");

            // Save the user to the database
            userToAdd
              .save()
              .then((addedUser) => {
                if (!addedUser)
                  return StatusResponse(res, 500, "Cannot add user");

                userToAdd
                  .addRole(foundRole, {
                    through: {
                      id: UUID("userrole"),
                      creator: req.authUserId,
                    },
                  })
                  .then(() => {
                    return StatusResponse(res, 200, "OK", {
                      user: copyObject(addedUser, Attributes.UserFull),
                    });
                  })
                  .catch((err) => next(err));
                })
                .catch((err) => next(err));
          })
          .catch((err) => next(err));
      })
      .catch((err) => next(err));
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  const userToFind = req.params.userId;
  const newOwner = req.params.ownerId;
  const reassign = req.params.ownerId ? true : false;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  // Check that the user isn't trying to delete themselves
  if (userToFind === req.authUserId)
    return StatusResponse(res, 421, "Cannot delete self");

  User.findByPk(userToFind)
    .then(async (foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");
      if (!Security.isInSameOrganization(req, foundUser))
        return StatusResponse(res, 403, "Cross-organization access denied");

      if( foundUser.protected === true ) return StatusResponse(res, 421, "User is protected");

      // Ownership check if the curent user is NOT an admin
      if (
        !Security.getVerdict(req.verdicts, "delete").isAdmin &&
        !Security.isOwner(req.authUserId, foundUser)
      ) {
        return StatusResponse(res, 421, "Not owner");
      }

      if (reassign) {
        // Update the creator ID in all the tables
        const updates = [{ creator: newOwner }];
        await bulkUpdate(updates, { where: { creator: foundUser.id } });
      }

      // Most database tables will cascade the deletion
      // Exeptions are Roles and Capabilities otherwise that
      // would compromise the security model

      // We need to be mindful of the image files that are stored
      // outside of the database

      await Image.findAll({ where: { creator: foundUser.id } }).then(
        (foundImages) => {
          if (foundImages) {
            for (const i of foundImages) {
              MediaStorage.getProvider().deleteObject(i.filename)
                .then((result) => {
                  /* File deleted */
                })
                .catch((err) => next(err));
            }
          }
        }
      );

      await foundUser
        .destroy({ options: { cascade: true } })
        .then((destroyedUser) => {
          if (!destroyedUser)
            return StatusResponse(res, 500, "Cannot delete user");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.postUpdateUser = (req, res, next) => {
  const userToFind = req.params.userId;
  let emailChange = false;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  User.findByPk(userToFind)
    .then(async (foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");
      if (!Security.isInSameOrganization(req, foundUser))
        return StatusResponse(res, 403, "Cross-organization access denied");

      if( foundUser.protected === true ) return StatusResponse(res, 421, "User is protected")

      // Ownership check if the curent user is NOT an admin
      // unless the user is updating their own details

      if (
        !(userToFind === req.authUserId) &&
        !Security.getVerdict(req.verdicts, "edit").isAdmin &&
        !Security.isOwner(req.authUserId, foundUser)
      ) {
        return StatusResponse(res, 421, "Not owner");
      }

      if (req.body.alias) foundUser.alias = req.body.alias;
      if (req.body.firstName) foundUser.firstName = req.body.firstName;
      if (req.body.lastName) foundUser.lastName = req.body.lastName;
      if (req.body.active || req.body.active === false)
        foundUser.active = req.body.active;
      if (req.body.verified || req.body.verified === false)
        foundUser.verified = req.body.verified;
      if (req.body.admin || req.body.admin === false) {
        if (!req.isAdmin) {
          return StatusResponse(res, 403, "Only system admins can update system admin");
        }
        foundUser.systemAdmin = req.body.admin;
        foundUser.admin = req.body.admin;
      }
      if (req.body.systemAdmin || req.body.systemAdmin === false) {
        if (!req.isAdmin) {
          return StatusResponse(res, 403, "Only system admins can update system admin");
        }
        foundUser.systemAdmin = req.body.systemAdmin;
        foundUser.admin = req.body.systemAdmin;
      }
      if (req.body.imageId) foundUser.imageId = req.body.imageId;

      if (req.body.organizationId && req.body.organizationId !== foundUser.organizationId) {
        if (!req.isAdmin) {
          return StatusResponse(res, 421, "A user cannot be moved to another organization");
        }
        const foundOrganization = await Organization.findByPk(req.body.organizationId);
        if (!foundOrganization) {
          return StatusResponse(res, 421, "Organization not found");
        }
        foundUser.organizationId = req.body.organizationId;
      }

      if (req.body.organizationAdmin || req.body.organizationAdmin === false) {
        if (!req.isAdmin && req.isOrganizationAdmin !== true) {
          return StatusResponse(res, 403, "Not authorized to update organization admin");
        }
        foundUser.organizationAdmin = req.body.organizationAdmin;
      }

      if (req.body.workgroupAdmin || req.body.workgroupAdmin === false) {
        if (!req.isAdmin && req.isOrganizationAdmin !== true) {
          return StatusResponse(res, 403, "Not authorized to update workgroup admin");
        }
        foundUser.workgroupAdmin = req.body.workgroupAdmin;
      }

      if (req.body.adminWorkgroupId || req.body.adminWorkgroupId === null) {
        if (!req.isAdmin && req.isOrganizationAdmin !== true) {
          return StatusResponse(res, 403, "Not authorized to update adminWorkgroupId");
        }
        foundUser.adminWorkgroupId = req.body.adminWorkgroupId;
      } else if (req.body.adminGroupId || req.body.adminGroupId === null) {
        // Backward compatible field name
        if (!req.isAdmin && req.isOrganizationAdmin !== true) {
          return StatusResponse(res, 403, "Not authorized to update adminWorkgroupId");
        }
        foundUser.adminWorkgroupId = req.body.adminGroupId;
      }

      if (foundUser.workgroupAdmin === true) {
        if (!foundUser.adminWorkgroupId) {
          return StatusResponse(res, 421, "Workgroup admin requires adminWorkgroupId");
        }
        const foundAdminWorkgroup = await Workgroup.findOne({
          where: { id: foundUser.adminWorkgroupId, organizationId: foundUser.organizationId },
        });
        if (!foundAdminWorkgroup) {
          return StatusResponse(res, 421, "Invalid adminWorkgroupId for workgroup admin");
        }
      }

      /* If the email address is being changed, keep it in a temporary
      field and get confirmation from the original owner. While that
      is happening, we will unverify the user.
      There is a 3-day expiration timer on the confirmation */
      if (req.body.email) {
        if (req.body.email !== foundUser.email) {
          foundUser.changeToEmail = req.body.email;
          foundUser.verified = false;
          foundUser.registerToken = UUID("wotlwedu");
          foundUser.registerTokenExpire = Date.now() + 3600000 * 24 * 30;
          emailChange = true;
        }
      }

      if (req.body.enable2fa || req.body.enable2fa === false) {
        foundUser.enable2fa = req.body.enable2fa;
      }

      foundUser
        .save()
        .then((user) => {
          if (!user) return StatusResponse(res, 500, "Unable to update user");
        })
        .then(() => {
          if (emailChange) {
            Mailer.sendEmailChangeMessage(
              foundUser.email,
              foundUser.changeToEmail,
              foundUser.registerToken,
              Config.baseFrontendUrl
            )
              .then(() => {
                return StatusResponse(res, 200, "User updated", {
                  user: copyObject(foundUser, Attributes.UserFull),
                  emailChange: emailChange,
                });
              })
              .catch((err) => {
                return StatusResponse(
                  res,
                  500,
                  "Unable to send address change email",
                  { error: err }
                );
              });
          } else {
            return StatusResponse(res, 200, "User updated", {
              user: copyObject(foundUser, Attributes.UserFull),
              emailChange: emailChange,
            });
          }
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.getUserFriends = async (req, res, next) => {
  let userToFind = req.params.userId;
  const showBlocked = req.query.blocked;

  let whereCondition = {};
  const options = {};

  if (!userToFind) {
    userToFind = req.authUserId;
  }

  if (!showBlocked) {
    const blockedStatus = await getStatusIdByName("Blocked");
    whereCondition.statusId = { [Op.ne]: blockedStatus };
  }

  whereCondition.userId = userToFind;

  options.where = whereCondition;

  options.attributes = ["id"];

  // Sort order
  options.order = [
    [User, "lastName"],
    [User, "firstName"],
  ];

  const includes = [];

  const modImageAttributes = Attributes.Image.slice();
  modImageAttributes.push([
    Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
    "url",
  ]);
  const imageIncludes = { model: Image, attributes: modImageAttributes };
  const userIncludes = {
    model: User,
    attributes: Attributes.Friend,
    include: imageIncludes,
  };
  const statusIncludes = { model: Status, attributes: Attributes.Status };
  includes.push(userIncludes);
  includes.push(statusIncludes);

  options.include = includes;
  options.distinct = true;

  // Find the friends in the table
  Friend.findAndCountAll(options)
    .then(({ count, rows }) => {
      if (count <= 0) {
        return StatusResponse(res, 200, "OK", {
          total: 0,
          friends: [],
        });
      } else {
        return StatusResponse(res, 200, "OK", {
          total: count,
          friends: rows,
        });
      }
    })
    .catch((err) => next(err));
};

// There are 2 steps to the friend process
// an add post is made by the initiator. This will create a friend record
// but it will be marked as pending until the friend accepts.
// Additionally, the friend may block the intiator to prevent further requests
// This function either takes a userId and friendId in the parameters
// or, if those parameters are not present, will use the authUserId from the request
// and an email address in the body as the friend
exports.putAddFriend = (req, res, next) => {
  const userToFind = req.params.userId;
  const friendToFind = req.params.friendId;
  const userOptions = {};
  const friendOptions = {};

  if( userToFind === 'system') return StatusResponse(res, 421, "User is protected")

  if (!userToFind) {
    if (!req.authUserId) return StatusResponse(res, 421, "No user ID provided");
    userOptions.where = { id: req.authUserId };
  } else {
    userOptions.where = { id: userToFind };
  }

  if (!friendToFind) {
    if (!req.body.email)
      return StatusResponse(res, 421, "No friend ID or email address provided");
    friendOptions.where = { email: req.body.email };
  } else {
    friendOptions.where = { id: friendToFind };
  }

  User.findOne(userOptions)
    .then((foundUser) => {
      if (!foundUser)
        return StatusResponse(res, 404, "User not found", {
          userId: userToFind,
        });
      if (!Security.isInSameOrganization(req, foundUser))
        return StatusResponse(res, 403, "Cross-organization access denied");

      User.findOne(friendOptions)
        .then((foundFriend) => {
          if (!foundFriend) return StatusResponse(res, 404, "Friend not found");
          if (!Security.isInSameOrganization(req, foundFriend))
            return StatusResponse(res, 403, "Cross-organization access denied");

          Friend.findAll({
            where: {
              [Op.or]: [
                { userId: foundUser.id, friendId: foundFriend.id },
                { userId: foundFriend.id, friendId: foundUser.id },
              ],
            },
          })
            .then(async (foundRelationships) => {
              if (!foundRelationships) {
                return StatusResponse(res, 500, "Cannot access relationships");
              } else if (foundRelationships.length === 0) {
                // Otherwise add the relationship and send the friend request
                const friendship = new Friend();

                friendship.id = UUID("friend");
                friendship.userId = foundUser.id;
                friendship.friendId = foundFriend.id;
                // Create a token with a 30-day expiry
                friendship.token = UUID("wotlwedu");
                friendship.tokenExpire = Date.now() + 3600000 * 24 * 30;
                friendship.creator = req.authUserId;

                const friendresult = await friendship.save();
                if (!friendresult) {
                  return StatusResponse(
                    res,
                    500,
                    "Unable to add relationship"
                  );
                }

                const friendNotification = await getStatusIdByName(
                  "Friend Request"
                );
                await Notify.sendNotification(
                  req.authUserId,
                  foundFriend.id,
                  friendNotification,
                  friendship.token,
                  req.authName + " wants to be friends"
                );

                return StatusResponse(res, 200, "OK", {
                  friendshipToken: friendship.token,
                });
              } else {
                let pending = false;
                let blocked = false;
                const pendingStatus = await getStatusIdByName("Pending");
                const blockedStatus = await getStatusIdByName("Blocked");
                foundRelationships.forEach((relationship) => {
                  if (relationship.statusId === pendingStatus) pending = true;
                  if (relationship.statusId === blockedStatus) blocked = true;
                });

                if (blocked === true)
                  return StatusResponse(res, 421, "Blocked");

                if (pending === true)
                  return StatusResponse(res, 421, "Request pending");

                return StatusResponse(res, 421, "Already friends");
              }
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

function getRelationshipDetails(relationshipId) {
  return new Promise((resolve, reject) => {
    if (!relationshipId)
      resolve({ status: 200, message: "OK", user: null, friend: null });
    Friend.findByPk(relationshipId)
      .then((result) => {
        if (!result)
          resolve({ status: 404, message: "Relationship not found" });
        resolve({
          status: 200,
          message: "OK",
          user: result.userId,
          friend: result.friendId,
        });
      })
      .catch((err) => reject(err));
  });
}

exports.deleteRelationship = (req, res, next) => {
  let userToFind = req.params.userId;
  let friendToFind = req.params.friendId;
  let relationshipId = req.params.relationshipId;

  // We need to call this every time to determine
  // the user and friend IDs because when a relationshipId
  // is provider, the user IDs are not
  // If there is no relationship Id, this will return null
  // values which we can overwrite with the data we DO have
  getRelationshipDetails(relationshipId)
    .then((result) => {
      if (result.status !== 200)
        return StatusResponse(res, result.status, result.message);

      if (result && result.user && result.friend) {
        userToFind = result.user;
        friendToFind = result.friend;
      }
    })
    .then(() => {
      if (!userToFind || !friendToFind)
        return StatusResponse(res, 404, "Cannot find relationship");

      const friendWhereCondition = {
        [Op.or]: [
          { userId: userToFind, friendId: friendToFind },
          { userId: friendToFind, friendId: userToFind },
        ],
      };
      const notifWhereCondition = {
        [Op.or]: [
          { userId: userToFind, senderId: friendToFind },
          { userId: friendToFind, senderId: userToFind },
        ],
      };

      const options = {};
      options.where = notifWhereCondition;

      Notification.destroy(options)
        .then((deletedNotifications) => {
          options.where = friendWhereCondition;
          Friend.destroy(options)
            .then((deletedFriends) => {
              if (!deletedFriends)
                return StatusResponse(res, 500, "Cannot delete relationship");

              return StatusResponse(res, 200, "OK", {
                user: userToFind,
                friend: friendToFind,
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    });
};

exports.putBlockUser = (req, res, next) => {
  let userToFind = req.params.userId;
  const blockToFind = req.params.blockUser;

  if (!userToFind) {
    userToFind = req.authUserId;
  }
  if (!blockToFind) return StatusResponse(res, 421, "No block ID provided");

  User.findByPk(userToFind)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");
      if (!Security.isInSameOrganization(req, foundUser))
        return StatusResponse(res, 403, "Cross-organization access denied");

      User.findByPk(blockToFind)
        .then((blockUser) => {
          if (!blockUser)
            return StatusResponse(res, 404, "Block user not found");
          if (!Security.isInSameOrganization(req, blockUser))
            return StatusResponse(res, 403, "Cross-organization access denied");

          // Delete any relationship that exists already
          Friend.destroy({
            where: {
              [Op.or]: [
                {
                  userId: foundUser.id,
                  friendId: blockUser.id,
                },
                {
                  userId: blockUser.id,
                  friendId: foundUser.id,
                },
              ],
            },
          })
            .then(async () => {
              // Add a block relationship
              const blockFriend = new Friend();
              const blockedStatus = await getStatusIdByName("Blocked");
              blockFriend.id = UUID("block");
              blockFriend.creator = req.authUserId;
              blockFriend.userId = foundUser.id;
              blockFriend.friendId = blockUser.id;
              blockFriend.statusId = blockedStatus;

              blockFriend.save().then((blockedFriend) => {
                if (!blockedFriend)
                  return StatusResponse(res, 500, "Cannot add friend block");

                return StatusResponse(res, 200, "OK");
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.deleteBlockUser = (req, res, next) => {
  const userToFind = req.params.userId;
  const blockToFind = req.params.blockId;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");
  if (!blockToFind) return StatusResponse(res, 421, "No block ID provided");

  User.findByPk(userToFind)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");
      if (!Security.isInSameOrganization(req, foundUser))
        return StatusResponse(res, 403, "Cross-organization access denied");

      User.findByPk(blockToFind)
        .then((blockUser) => {
          if (!blockUser)
            return StatusResponse(res, 404, "Block user not found");
          if (!Security.isInSameOrganization(req, blockUser))
            return StatusResponse(res, 403, "Cross-organization access denied");

          // Delete any relationship that exists already
          Friend.destroy({
            where: {
              [Op.or]: [
                {
                  userId: foundUser.id,
                  friendId: blockUser.id,
                },
                {
                  userId: blockUser.id,
                  friendId: foundUser.id,
                },
              ],
            },
          })
            .then((deletedBlock) => {
              if (!deletedBlock)
                return StatusResponse(res, 500, "Cannot delete block");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.getAcceptFriendRequest = async (req, res, next) => {
  const tokenToFind = req.params.tokenId;
  const friendStatus = await getStatusIdByName("Friend");

  if (!tokenToFind) return StatusResponse(res, 421, "No token ID provided");

  // Can only be accepted by the requestee
  // and the token must still be valid
  Friend.findOne({
    where: { token: tokenToFind, tokenExpire: { [Op.gte]: Date.now() } },
  })
    .then((foundRelationship) => {
      if (!foundRelationship)
        return StatusResponse(res, 404, "Friend request not found");

      if (foundRelationship.friendId !== req.authUserId)
        return StatusResponse(res, 421, "Not owner");

      foundRelationship.token = null;
      foundRelationship.tokenExpire = null;
      foundRelationship.statusId = friendStatus;

      foundRelationship
        .save()
        .then((updatedRelationship) => {
          if (!updatedRelationship)
            return StatusResponse(res, 500, "Cannot update friend request");

          // Now add the reciprocal relationship
          // Check to see if one already exists for some reason
          Friend.findOne({
            where: {
              userId: req.authUserId,
              friendId: foundRelationship.userId,
            },
          })
            .then((foundReciprocal) => {
              if (foundReciprocal) {
                foundReciprocal.statusId = friendStatus;
                return foundReciprocal.save();
              } else {
                const newReciprocal = new Friend();
                newReciprocal.creator = req.authUserId;
                newReciprocal.id = UUID("friend");
                newReciprocal.userId = req.authUserId;
                newReciprocal.friendId = foundRelationship.userId;
                newReciprocal.statusId = friendStatus;

                return newReciprocal.save();
              }
            })
            .then((addedReciprocal) => {
              if (!addedReciprocal)
                return StatusResponse(
                  res,
                  500,
                  "Cannot add reciprocal relationship"
                );
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.deleteFriendRequest = (req, res, next) => {
  const friendRequestToFind = req.params.requestId;
  let userToFind = req.params.userId;

  if (!friendRequestToFind)
    return StatusResponse(res, 421, "No request Id provided");
  if (!userToFind) {
    userToFind = req.authUserId;
  }

  const options = {};
  const whereCondition = {};
  whereCondition.id = friendRequestToFind;
  whereCondition.userId = userToFind;

  options.where = whereCondition;

  Friend.findOne(options)
    .then((foundRequest) => {
      if (!foundRequest) return StatusResponse(res, 404, "No request found");

      const recipientId = foundRequest.friendId;

      foundRequest
        .destroy()
        .then(async (deletedRequest) => {
          if (!deletedRequest)
            return StatusResponse(res, 500, "Cannot delete friend request");

          const notifWhere = {};
          notifWhere.senderId = userToFind;
          notifWhere.userId = recipientId;

          await Notification.destroy({ where: notifWhere });

          return StatusResponse(res, 200, "OK", { id: foundRequest.id });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

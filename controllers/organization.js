const { Op } = require("sequelize");

const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");

const Organization = require("../model/organization");
const OrganizationInvite = require("../model/organizationinvite");
const User = require("../model/user");
const Attributes = require("../model/attributes");
const Config = require("../config/wotlwedu");

function serializeInvite(invite) {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    email: invite.email,
    token: invite.token,
    invitedByUserId: invite.invitedByUserId,
    acceptedAt: invite.acceptedAt,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  };
}

async function findActiveOrganizationInvite(organizationId, inviteId) {
  if (!organizationId || !inviteId) return null;

  const invite = await OrganizationInvite.findOne({
    where: {
      id: inviteId,
      organizationId,
      acceptedAt: null,
    },
  });
  if (!invite) return null;
  return invite;
}

function assertOrgAdmin(req, organizationId = null) {
  if (req.isAdmin === true) return true;
  if (req.isOrganizationAdmin !== true) return false;
  if (!organizationId) return true;
  return req.authOrganizationId === organizationId;
}

// Read access is less restrictive than management access:
// any authenticated user can read their own organization; only org admins can manage it.
function canReadOrg(req, organizationId = null) {
  if (req.isAdmin === true) return true;
  if (!req.authOrganizationId) return false;
  if (!organizationId) return true;
  return req.authOrganizationId === organizationId;
}

module.exports.getOrganization = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!canReadOrg(req, organizationId))
      return StatusResponse(res, 403, "Not authorized for this organization");

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");
    return StatusResponse(res, 200, "OK", { organization: foundOrganization });
  } catch (err) {
    next(err);
  }
};

module.exports.getAllOrganization = async (req, res, next) => {
  try {
    // System admins can list all orgs; everyone else can only list their own org.
    if (req.isAdmin !== true && !req.authOrganizationId) {
      return StatusResponse(res, 403, "No organization context available");
    }

    let page = +req.query.page || 1;
    let itemsPerPage = +req.query.items || 20;
    if (page <= 0) page = 1;
    if (itemsPerPage <= 0) itemsPerPage = 20;

    const whereCondition = {};
    if (req.isAdmin !== true) whereCondition.id = req.authOrganizationId;
    if (req.query.filter) {
      whereCondition[Op.or] = [{ name: { [Op.like]: "%" + req.query.filter + "%" } }];
    }

    const { count, rows } = await Organization.findAndCountAll({
      where: whereCondition,
      order: [["name"]],
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage,
      attributes: Attributes.Organization,
    });

    return StatusResponse(res, 200, "OK", {
      total: count,
      page,
      itemsPerPage,
      organizations: rows || [],
    });
  } catch (err) {
    next(err);
  }
};

module.exports.putAddOrganization = async (req, res, next) => {
  try {
    if (req.isAdmin !== true)
      return StatusResponse(res, 403, "Only system admins can create organizations");

    const name = req.body.name;
    if (!name) return StatusResponse(res, 421, "No organization name provided");

    const existing = await Organization.findOne({ where: { name } });
    if (existing) return StatusResponse(res, 421, "Organization exists");

    const organizationToAdd = new Organization();
    organizationToAdd.id = req.body.id || UUID("org");
    organizationToAdd.name = name;
    organizationToAdd.description = req.body.description || null;
    organizationToAdd.active =
      req.body.active || req.body.active === false ? req.body.active : true;
    organizationToAdd.creator = req.authUserId || "system";

    const addedOrganization = await organizationToAdd.save();
    if (!addedOrganization) return StatusResponse(res, 500, "Cannot add organization");

    return StatusResponse(res, 200, "OK", {
      organization: {
        id: addedOrganization.id,
        name: addedOrganization.name,
        description: addedOrganization.description,
        active: addedOrganization.active,
        creator: addedOrganization.creator,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postUpdateOrganization = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!assertOrgAdmin(req, organizationId))
      return StatusResponse(res, 403, "Not authorized for this organization");

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");

    if (req.body.name) foundOrganization.name = req.body.name;
    if (req.body.description || req.body.description === null)
      foundOrganization.description = req.body.description;
    if (req.body.active || req.body.active === false)
      foundOrganization.active = req.body.active;

    const updatedOrganization = await foundOrganization.save();
    if (!updatedOrganization) return StatusResponse(res, 500, "Cannot update organization");
    return StatusResponse(res, 200, "OK", {
      organization: {
        id: updatedOrganization.id,
        name: updatedOrganization.name,
        description: updatedOrganization.description,
        active: updatedOrganization.active,
        creator: updatedOrganization.creator,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.deleteOrganization = async (req, res, next) => {
  try {
    if (req.isAdmin !== true)
      return StatusResponse(res, 403, "Only system admins can delete organizations");

    const organizationId = req.params.organizationId;
    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (organizationId === "org_default") {
      return StatusResponse(res, 421, "Cannot delete default organization");
    }

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");

    const deleted = await foundOrganization.destroy();
    if (!deleted) return StatusResponse(res, 500, "Cannot delete organization");
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    next(err);
  }
};

module.exports.putInviteToOrganization = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    const email = (req.body.email || "").trim().toLowerCase();

    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!assertOrgAdmin(req, organizationId))
      return StatusResponse(res, 403, "Not authorized for this organization");
    if (!email) return StatusResponse(res, 421, "No email provided");

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");
    if (foundOrganization.active === false)
      return StatusResponse(res, 421, "Organization is inactive");

    const foundUser = await User.findOne({ where: { email } });
    if (foundUser) {
      if (foundUser.organizationId === organizationId) {
        return StatusResponse(res, 421, "User already belongs to this organization");
      }
      return StatusResponse(res, 421, "User already belongs to another organization");
    }

    let invite = await OrganizationInvite.findOne({
      where: {
        organizationId,
        email,
        acceptedAt: null,
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gte]: new Date() } }],
      },
      order: [["createdAt", "DESC"]],
    });

    const expiresAt = req.body.expiresAt || null;
    if (invite) {
      invite.token = UUID("orginvite");
      invite.invitedByUserId = req.authUserId;
      invite.expiresAt = expiresAt;
      invite.creator = req.authUserId;
      await invite.save();
    } else {
      invite = await OrganizationInvite.create({
        id: UUID("orginvite"),
        organizationId,
        email,
        token: UUID("orginvite"),
        invitedByUserId: req.authUserId,
        expiresAt,
        creator: req.authUserId,
      });
    }

    await Mailer.sendOrganizationInviteMessage(
      email,
      foundOrganization.name,
      invite.token,
      Config.baseFrontendUrl
    );

    return StatusResponse(res, 200, "OK", {
      invite: serializeInvite(invite),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getOrganizationInvites = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!assertOrgAdmin(req, organizationId))
      return StatusResponse(res, 403, "Not authorized for this organization");

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");

    const invites = await OrganizationInvite.findAll({
      where: {
        organizationId,
        acceptedAt: null,
      },
      order: [["createdAt", "DESC"]],
    });

    const activeInvites = (invites || []).filter((invite) => {
      if (!invite.expiresAt) return true;
      return new Date(invite.expiresAt).getTime() >= Date.now();
    });

    return StatusResponse(res, 200, "OK", {
      invites: activeInvites.map((invite) => serializeInvite(invite)),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postResendOrganizationInvite = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    const inviteId = req.params.inviteId;

    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!inviteId) return StatusResponse(res, 421, "No invite ID provided");
    if (!assertOrgAdmin(req, organizationId))
      return StatusResponse(res, 403, "Not authorized for this organization");

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");

    const invite = await findActiveOrganizationInvite(organizationId, inviteId);
    if (!invite) return StatusResponse(res, 404, "Invite not found");

    invite.token = UUID("orginvite");
    invite.invitedByUserId = req.authUserId;
    invite.updatedAt = new Date();
    await invite.save();

    await Mailer.sendOrganizationInviteMessage(
      invite.email,
      foundOrganization.name,
      invite.token,
      Config.baseFrontendUrl
    );

    return StatusResponse(res, 200, "OK", {
      invite: serializeInvite(invite),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.deleteOrganizationInvite = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    const inviteId = req.params.inviteId;

    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!inviteId) return StatusResponse(res, 421, "No invite ID provided");
    if (!assertOrgAdmin(req, organizationId))
      return StatusResponse(res, 403, "Not authorized for this organization");

    const foundOrganization = await Organization.findByPk(organizationId);
    if (!foundOrganization) return StatusResponse(res, 404, "Organization not found");

    const invite = await findActiveOrganizationInvite(organizationId, inviteId);
    if (!invite) return StatusResponse(res, 404, "Invite not found");

    await invite.destroy();
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    next(err);
  }
};

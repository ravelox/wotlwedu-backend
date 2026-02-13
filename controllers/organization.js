const { Op } = require("sequelize");

const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");

const Organization = require("../model/organization");
const Attributes = require("../model/attributes");

function assertOrgAdmin(req, organizationId = null) {
  if (req.isAdmin === true) return true;
  if (req.isOrganizationAdmin !== true) return false;
  if (!organizationId) return true;
  return req.authOrganizationId === organizationId;
}

module.exports.getOrganization = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId;
    if (!organizationId) return StatusResponse(res, 421, "No organization ID provided");
    if (!assertOrgAdmin(req, organizationId))
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
    if (!assertOrgAdmin(req))
      return StatusResponse(res, 403, "Not authorized");

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

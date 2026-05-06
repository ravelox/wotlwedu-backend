const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, buildCategoryMenu } = require("../util/helpers");
const toBool = require("../util/tobool");
const CategoryScope = require("../util/categoryscope");
const { normalizeOptionalId } = require("../util/idnormalize");
const { Op } = require("sequelize");

const Config = require("../config/wotlwedu");

const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");
const User = require("../model/user");
const Category = require("../model/category");
const Organization = require("../model/organization");

const Attributes = require("../model/attributes");

function generateIncludes(details, req) {
  const includes = [];
  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("user")) {
      includes.push({
        model: User,
        attributes: Attributes.User,
        through: { attributes: [] },
      });
    }
    if (splitDetail.includes("category")) {
      includes.push({
        model: Category,
        attributes: Attributes.Category,
        where: { creator: req.authUserId },
        required: false,
      });
    }
  }
  return includes;
}

module.exports.getSingleWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);
  if (
    !Security.getVerdict(req.verdicts, "view").isAdmin &&
    req.isOrganizationAdmin !== true &&
    req.isWorkgroupAdmin !== true
  ) {
    whereCondition.creator = req.authUserId;
  }

  const options = {};
  options.where = whereCondition;
  options.include = generateIncludes(req.query.detail, req);
  options.attributes = Attributes.Workgroup;

  Workgroup.findOne(options)
    .then((foundWorkgroup) => {
      if (!foundWorkgroup)
        return StatusResponse(res, 404, "Workgroup not found");
      if (
        req.isWorkgroupAdmin === true &&
        !Security.canManageWorkgroup(req, foundWorkgroup)
      ) {
        return StatusResponse(res, 403, "Cannot access another workgroup");
      }
      return StatusResponse(res, 200, "OK", { workgroup: foundWorkgroup });
    })
    .catch((err) => next(err));
};

module.exports.getAllWorkgroup = (req, res, next) => {
  let userFilter = req.query.filter;
  const requestedOrganizationId = normalizeOptionalId(req.query.organizationId).value;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};
  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;
  options.order = [["name"]];

  let whereCondition = {};
  if (userFilter) {
    whereCondition = {
      [Op.or]: [{ name: { [Op.like]: "%" + userFilter + "%" } }],
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

  const isScopedAdmin =
    Security.getVerdict(req.verdicts, "view").isAdmin ||
    req.isOrganizationAdmin === true ||
    req.isWorkgroupAdmin === true;

  // Regular users should see workgroups they belong to (not just those they created).
  if (!isScopedAdmin) {
    options.include = [
      {
        model: User,
        attributes: [],
        through: { attributes: [] },
        where: { id: req.authUserId },
        required: true,
      },
    ];
  }
  if (req.isWorkgroupAdmin === true && req.adminWorkgroupId) {
    whereCondition.id = req.adminWorkgroupId;
  }

  options.where = whereCondition;
  // If the caller requested details, add those includes in addition to any membership join.
  const detailIncludes = generateIncludes(req.query.detail, req);
  if (detailIncludes.length > 0) {
    options.include = (options.include || []).concat(detailIncludes);
  }
  options.attributes = Attributes.Workgroup;
  options.distinct = true;

  const runQuery = () => Workgroup.findAndCountAll(options);

  runQuery()
    .then(({ count, rows }) => {
      const payload = {
        total: rows ? count : 0,
        page: page,
        itemsPerPage: itemsPerPage,
        workgroups: rows || [],
      };
      if (toBool(req.query.collapsible)) {
        payload.menu = buildCategoryMenu(rows || [], "workgroups");
      }
      return StatusResponse(res, 200, "OK", payload);
    })
    .catch(async (err) => {
      // Self-heal for partially initialised databases (e.g. updates not run yet):
      // if the workgroups table is missing, try to create it and retry once.
      const missingTable =
        err &&
        (err.code === "ER_NO_SUCH_TABLE" ||
          err.name === "SequelizeDatabaseError") &&
        String(err.sql || "").includes("`workgroups`");

      if (!missingTable) return next(err);

      try {
        await Workgroup.sync();
        await WorkgroupMember.sync();
        const { count, rows } = await runQuery();
        const payload = {
          total: rows ? count : 0,
          page: page,
          itemsPerPage: itemsPerPage,
          workgroups: rows || [],
        };
        if (toBool(req.query.collapsible)) {
          payload.menu = buildCategoryMenu(rows || [], "workgroups");
        }
        return StatusResponse(res, 200, "OK", payload);
      } catch (syncErr) {
        return next(syncErr);
      }
    });
};

module.exports.postUpdateWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Workgroup.findOne({ where: whereCondition })
    .then(async (foundWorkgroup) => {
      if (!foundWorkgroup)
        return StatusResponse(res, 404, "Workgroup not found");
      if (!Security.canManageWorkgroup(req, foundWorkgroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      if (req.body.name) foundWorkgroup.name = req.body.name;
      if (req.body.description) foundWorkgroup.description = req.body.description;
      if (req.body.listType) foundWorkgroup.listType = req.body.listType;
      const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
        req,
        req.body.categoryId
      );
      if (!categoryResolution.ok) {
        return StatusResponse(
          res,
          categoryResolution.status,
          categoryResolution.message
        );
      }
      if (categoryResolution.hasValue) {
        foundWorkgroup.categoryId = categoryResolution.value;
      }

      foundWorkgroup
        .save()
        .then((updatedWorkgroup) => {
          if (!updatedWorkgroup)
            return StatusResponse(res, 500, "Cannot update workgroup");
          return StatusResponse(res, 200, "OK", {
            workgroup: copyObject(updatedWorkgroup, Attributes.Workgroup),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddWorkgroup = (req, res, next) => {
  if (req.isAdmin !== true && req.isOrganizationAdmin !== true) {
    return StatusResponse(
      res,
      403,
      "Only organization admins can add workgroups"
    );
  }

  const requestedOrganizationId = normalizeOptionalId(req.body.organizationId);
  const organizationId = requestedOrganizationId.hasField
    ? requestedOrganizationId.value
    : req.authOrganizationId || null;
  if (!organizationId && req.isAdmin !== true) {
    return StatusResponse(res, 421, "No organization context available");
  }

  Workgroup.findOne({ where: { organizationId: organizationId, name: req.body.name } })
    .then(async (foundWorkgroup) => {
      if (foundWorkgroup) throw new Error("Workgroup already exists");
      return Organization.findByPk(organizationId);
    })
    .then(async (foundOrganization) => {
      if (!foundOrganization)
        return StatusResponse(res, 421, "Organization not found");

      const workgroupToAdd = new Workgroup();
      workgroupToAdd.id = UUID("workgroup");
      workgroupToAdd.creator = req.authUserId;
      workgroupToAdd.organizationId = organizationId;
      workgroupToAdd.name = req.body.name;
      workgroupToAdd.description = req.body.description;
      if (req.body.listType) workgroupToAdd.listType = req.body.listType;
      const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
        req,
        req.body.categoryId
      );
      if (!categoryResolution.ok) {
        return StatusResponse(
          res,
          categoryResolution.status,
          categoryResolution.message
        );
      }
      if (categoryResolution.hasValue) {
        workgroupToAdd.categoryId = categoryResolution.value;
      }

      workgroupToAdd
        .save()
        .then((addedWorkgroup) => {
          if (!addedWorkgroup)
            return StatusResponse(res, 500, "Cannot add workgroup");
          return StatusResponse(res, 200, "OK", {
            workgroup: copyObject(addedWorkgroup, Attributes.Workgroup),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => {
      if (err && err.message === "Workgroup already exists") {
        return StatusResponse(res, 421, "Workgroup already exists");
      }
      next(err);
    });
};

module.exports.putUserInWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  const userToFind = req.params.userId;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");
  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Workgroup.findOne({ where: whereCondition })
    .then((foundWorkgroup) => {
      if (!foundWorkgroup)
        return StatusResponse(res, 404, "Workgroup not found");
      if (!Security.canManageWorkgroup(req, foundWorkgroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      const userWhere = {
        id: personToFind,
        organizationId: foundWorkgroup.organizationId,
      };

      User.findOne({ where: userWhere })
        .then((userFound) => {
          if (!userFound) return StatusResponse(res, 404, "User not found");

          foundWorkgroup
            .addUser(userFound, {
              through: { id: UUID("workgroupmember"), creator: req.authUserId },
            })
            .then((addedUser) => {
              if (!addedUser)
                return StatusResponse(res, 500, "Cannot add user to workgroup");
              return StatusResponse(res, 200, "OK", {
                user: copyObject(addedUser, Attributes.User),
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteUserFromWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  const userToFind = req.params.userId;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");
  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Workgroup.findOne({ where: whereCondition })
    .then((foundWorkgroup) => {
      if (!foundWorkgroup)
        return StatusResponse(res, 404, "Workgroup not found");
      if (!Security.canManageWorkgroup(req, foundWorkgroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      User.findOne({
        where: { id: personToFind, organizationId: foundWorkgroup.organizationId },
      })
        .then((userFound) => {
          if (!userFound) return StatusResponse(res, 404, "User not found");

          foundWorkgroup
            .removeUser(userFound)
            .then((removedUser) => {
              if (!removedUser)
                return StatusResponse(
                  res,
                  500,
                  "Cannot delete user from workgroup"
                );
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Workgroup.findOne({ where: whereCondition })
    .then((foundWorkgroup) => {
      if (!foundWorkgroup)
        return StatusResponse(res, 404, "Workgroup not found");
      if (!Security.canManageWorkgroup(req, foundWorkgroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      foundWorkgroup
        .destroy()
        .then((deletedWorkgroup) => {
          if (!deletedWorkgroup)
            return StatusResponse(res, 500, "Cannot delete workgroup");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putBulkAddUserToWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  const personList = req.body.personList;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");
  if (!personList) return StatusResponse(res, 421, "No person list provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Workgroup.findOne({ where: whereCondition }).then(async (foundWorkgroup) => {
    if (!foundWorkgroup)
      return StatusResponse(res, 404, "Workgroup not found");
    if (!Security.canManageWorkgroup(req, foundWorkgroup))
      return StatusResponse(res, 403, "Not authorized for this workgroup");

    const results = [];
    for (const personToFind of personList) {
      await User.findOne({
        where: { id: personToFind, organizationId: foundWorkgroup.organizationId },
      })
        .then(async (userFound) => {
          if (!userFound) {
            results.push({
              id: personToFind,
              status: 404,
              message: "Person not found",
            });
          } else {
            await foundWorkgroup
              .addUser(userFound, {
                through: { id: UUID("workgroupmember"), creator: req.authUserId },
              })
              .then((addedUser) => {
                if (!addedUser) {
                  results.push({
                    id: personToFind,
                    status: 500,
                    message: "Cannot add person to workgroup",
                  });
                } else {
                  results.push({ id: personToFind, status: 200, message: "OK" });
                }
              })
              .catch((err) => next(err));
          }
        })
        .catch((err) => next(err));
    }
    return StatusResponse(res, 200, "OK", { results: results });
  });
};

module.exports.deleteBulkUserFromWorkgroup = (req, res, next) => {
  const workgroupToFind = req.params.workgroupId;
  const personList = req.body.personList;
  if (!workgroupToFind)
    return StatusResponse(res, 421, "No workgroup ID provided");
  if (!personList) return StatusResponse(res, 421, "No person list provided");

  let whereCondition = { id: workgroupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Workgroup.findOne({ where: whereCondition })
    .then(async (foundWorkgroup) => {
      if (!foundWorkgroup)
        return StatusResponse(res, 404, "Workgroup not found");
      if (!Security.canManageWorkgroup(req, foundWorkgroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      const results = [];
      for (const personToFind of personList) {
        await User.findOne({
          where: { id: personToFind, organizationId: foundWorkgroup.organizationId },
        })
          .then(async (userFound) => {
            if (!userFound) {
              results.push({
                id: personToFind,
                status: 404,
                message: "Person not found",
              });
            } else {
              await foundWorkgroup
                .removeUser(userFound)
                .then((removedUser) => {
                  if (!removedUser) {
                    results.push({
                      id: personToFind,
                      status: 500,
                      message: "Cannot delete person from workgroup",
                    });
                  } else {
                    results.push({ id: personToFind, status: 200, message: "OK" });
                  }
                })
                .catch((err) => next(err));
            }
          })
          .catch((err) => next(err));
      }
      return StatusResponse(res, 200, "OK", { results: results });
    })
    .catch((err) => next(err));
};

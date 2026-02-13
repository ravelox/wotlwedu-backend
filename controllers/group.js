const Util = require("util");

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject } = require("../util/helpers");
const { Op } = require("sequelize");
const Sequelize = require("sequelize")

const Config = require("../config/wotlwedu");

const Group = require("../model/group");
const User = require("../model/user");
const Category = require("../model/category");
const Organization = require("../model/organization");

const Attributes = require("../model/attributes")

function generateIncludes(details) {
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
      });
    }
  }
  return includes;
}
module.exports.getSingleGroup = (req, res, next) => {
  const groupToFind = req.params.groupId;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");

  let whereCondition = { id: groupToFind };
  Security.applyOrganizationScope(req, whereCondition);
  if (
    !Security.getVerdict(req.verdicts, "view").isAdmin &&
    req.isOrganizationAdmin !== true &&
    req.isWorkgroupAdmin !== true
  ) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  const options = {};

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Group;

  Group.findOne(options)
    .then((foundGroup) => {
      if (!foundGroup) return StatusResponse(res, 404, "Group not found");
      if (req.isWorkgroupAdmin === true && !Security.canManageWorkgroup(req, foundGroup)) {
        return StatusResponse(res, 403, "Cannot access another workgroup");
      }

      return StatusResponse(res, 200, "OK", { group: foundGroup });
    })
    .catch((err) => next(err));
};

module.exports.getAllGroup = (req, res, next) => {
  let userFilter = req.query.filter;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};

  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;

  // Sort order
  options.order = [["name"]];

  let whereCondition = {};

  if (userFilter) {
    whereCondition = {
      [Op.or]: [{ name: { [Op.like]: "%" + userFilter + "%" } }],
    };
  }

  Security.applyOrganizationScope(req, whereCondition);
  if (
    !Security.getVerdict(req.verdicts, "view").isAdmin &&
    req.isOrganizationAdmin !== true &&
    req.isWorkgroupAdmin !== true
  ) {
    whereCondition.creator = req.authUserId;
  }
  if (req.isWorkgroupAdmin === true && req.adminWorkgroupId) {
    whereCondition.id = req.adminWorkgroupId;
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.attributes = Attributes.Group;
  options.include = includes;
  options.distinct = true;

  Group.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        groups: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      groups: rows,
    });
  });
};

module.exports.postUpdateGroup = (req, res, next) => {
  const groupToFind = req.params.groupId;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");

  let whereCondition = {};

  whereCondition.id = groupToFind;

  Security.applyOrganizationScope(req, whereCondition);
  Group.findOne({ where: whereCondition })
    .then((foundGroup) => {
      if (!foundGroup) return StatusResponse(res, 404, "Group not found");
      if (!Security.canManageWorkgroup(req, foundGroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      if (req.body.name) foundGroup.name = req.body.name;
      if (req.body.description) foundGroup.description = req.body.description;
      if (req.body.listType) foundGroup.listType = req.body.listType;
      if (req.body.categoryId) foundGroup.categoryId = req.body.categoryId;

      foundGroup
        .save()
        .then((updatedGroup) => {
          if (!updatedGroup)
            return StatusResponse(res, 500, "Cannot update group");

          return StatusResponse(res, 200, "OK", {
            group: copyObject(foundGroup, Attributes.Group),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddGroup = (req, res, next) => {
  if (req.isAdmin !== true && req.isOrganizationAdmin !== true) {
    return StatusResponse(res, 403, "Only organization admins can add workgroups");
  }
  const organizationId =
    req.body.organizationId || req.authOrganizationId || null;
  if (!organizationId && req.isAdmin !== true) {
    return StatusResponse(res, 421, "No organization context available");
  }
  // Check to see if this user has already created a group with this name
  Group.findOne({
    where: {
      organizationId: organizationId,
      name: req.body.name,
    },
  })
    .then((foundGroup) => {
      if (foundGroup) throw new Error("Group already exists");
      return Organization.findByPk(organizationId);
    })
    .then((foundOrganization) => {
      if (!foundOrganization) return StatusResponse(res, 421, "Organization not found");

      // Populate the Group properties
      const groupToAdd = new Group();

      groupToAdd.id = UUID("group");
      groupToAdd.creator = req.authUserId;
      groupToAdd.organizationId = organizationId;
      groupToAdd.name = req.body.name;
      groupToAdd.description = req.body.description;
      if (req.body.listType) groupToAdd.listType = req.body.listType;
      if (req.body.categoryId) groupToAdd.categoryId = req.body.categoryId;

      // Save the Group to the database
      groupToAdd
        .save()
        .then((addedGroup) => {
          if (!addedGroup) return StatusResponse(res, 500, "Cannot add group");

          return StatusResponse(res, 200, "OK", {
            group: copyObject(addedGroup, Attributes.Group),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => {
      if (err && err.message === "Group already exists") {
        return StatusResponse(res, 421, "Group already exists");
      }
      next(err);
    });
};

module.exports.putUserInGroup = (req, res, next) => {
  const groupToFind = req.params.groupId;
  const userToFind = req.params.userId;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  let whereCondition = { id: groupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Group.findOne({ where: whereCondition })
    .then((foundGroup) => {
      if (!foundGroup) return StatusResponse(res, 404, "Group not found");
      if (!Security.canManageWorkgroup(req, foundGroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      const userWhere = { id: userToFind, organizationId: foundGroup.organizationId };
      User.findOne({ where: userWhere })
        .then((userFound) => {
          if (!userFound) return StatusResponse(res, 404, "User not found");

          foundGroup
            .addUser(userFound, {
              through: { id: UUID("groupmember"), creator: req.authUserId },
            })
            .then((addedUser) => {
              if (!addedUser)
                return StatusResponse(res, 500, "Cannot add user to group");

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

module.exports.deleteUserFromGroup = (req, res, next) => {
  const groupToFind = req.params.groupId;
  const userToFind = req.params.userId;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  let whereCondition = { id: groupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Group.findOne({ where: whereCondition })
    .then((foundGroup) => {
      if (!foundGroup) return StatusResponse(res, 404, "Group not found");
      if (!Security.canManageWorkgroup(req, foundGroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      User.findOne({ where: { id: userToFind, organizationId: foundGroup.organizationId } })
        .then((userFound) => {
          if (!userFound) return StatusResponse(res, 404, "User not found");

          foundGroup
            .removeUser(userFound)
            .then((removedUser) => {
              if (!removedUser)
                return StatusResponse(
                  res,
                  500,
                  "Cannot delete user from group"
                );

              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteGroup = (req, res, next) => {
  const groupToFind = req.params.groupId;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");

  let whereCondition = { id: groupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Group.findOne({ where: whereCondition })
    .then((foundGroup) => {
      if (!foundGroup) return StatusResponse(res, 404, "Group not found");
      if (!Security.canManageWorkgroup(req, foundGroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      foundGroup
        .destroy()
        .then((deletedGroup) => {
          if (!deletedGroup)
            return StatusResponse(res, 500, "Cannot delete group");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

// Bulk functions
module.exports.putBulkAddUserToRole = (req, res, next) => {
  const groupToFind = req.params.groupId;
  const userList = req.body.userList;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");
  if (!userList) return StatusResponse(res, 421, "No user list provided");

  let whereCondition = { id: groupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Group.findOne({ where: whereCondition }).then(async (foundGroup) => {
    if (!foundGroup) return StatusResponse(res, 404, "Group not found");
    if (!Security.canManageWorkgroup(req, foundGroup))
      return StatusResponse(res, 403, "Not authorized for this workgroup");

    // Work through the list of users
    const results = [];
    for (const userToFind of userList) {
      await User.findOne({ where: { id: userToFind, organizationId: foundGroup.organizationId } })
        .then(async (userFound) => {
          if (!userFound) {
            results.push({
              id: userToFind,
              status: 404,
              message: "User not found",
            });
          } else {
            const throughOption = {
              through: { id: UUID("groupmember"), creator: req.authUserId },
            };
            await foundGroup
              .addUser(userFound, throughOption)
              .then((addedUser) => {
                if (!addedUser) {
                  results.push({
                    id: userToFind,
                    status: 500,
                    message: "Cannot add user to group",
                  });
                } else {
                  results.push({
                    id: userToFind,
                    status: 200,
                    message: "OK",
                  });
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

module.exports.deleteBulkUserFromGroup = (req, res, next) => {
  const groupToFind = req.params.groupId;
  const userList = req.body.userList;
  if (!groupToFind) return StatusResponse(res, 421, "No group ID provided");
  if (!userList) return StatusResponse(res, 421, "No user list provided");

  let whereCondition = { id: groupToFind };
  Security.applyOrganizationScope(req, whereCondition);

  Group.findOne({ where: whereCondition })
    .then(async (foundGroup) => {
      if (!foundGroup) return StatusResponse(res, 404, "Group not found");
      if (!Security.canManageWorkgroup(req, foundGroup))
        return StatusResponse(res, 403, "Not authorized for this workgroup");

      const results = [];
      for (const userToFind of userList) {
        await User.findOne({ where: { id: userToFind, organizationId: foundGroup.organizationId } })
          .then(async (userFound) => {
            if (!userFound) {
              results.push({
                id: userToFind,
                status: 404,
                message: "User not found",
              });
            } else {
              await foundGroup
                .removeUser(userFound)
                .then((removedUser) => {
                  if (!removedUser) {
                    results.push({
                      id: userToFind,
                      status: 500,
                      message: "Cannot delete user from group",
                    });
                  } else {
                    results.push({
                      id: userToFind,
                      status: 200,
                      message: "OK",
                    });
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

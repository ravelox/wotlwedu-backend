const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize")

const Config = require("../config/wotlwedu");

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject } = require("../util/helpers");

const Role = require("../model/role");
const Capability = require("../model/capability");
const RoleCapability = require("../model/rolecapability");
const User = require("../model/user");
const UserRole = require("../model/userrole");

const Attributes = require("../model/attributes")

function generateIncludes(details) {
  let includes = [];
  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("capability")) {
      includes.push({
        model: Capability,
        attributes: Attributes.Capability,
        through: { attributes: [] },
      });
    }
    if (splitDetail.includes("user")) {
      includes.push({
        model: User,
        attributes: Attributes.User,
        through: { attributes: [] },
      });
    }
  }
  return includes;
}

module.exports.getSingleRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const whereCondition = {};
  const options = {};
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");

  whereCondition.id = roleToFind;

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Role;

  Role.findOne(options)
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      return StatusResponse(res, 200, "OK", { role: foundRole });
    })
    .catch((err) => next(err));
};

module.exports.getAllRole = (req, res, next) => {
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

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Role;
  options.distinct = true;

  Role.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        roles: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      roles: rows,
    });
  });
};

module.exports.postUpdateRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");

  let whereCondition = {};
  whereCondition.id = roleToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }
  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      if (req.body.name) foundRole.name = req.body.name;
      if (req.body.description) foundRole.description = req.body.description;

      foundRole
        .save()
        .then((updatedRole) => {
          if (!updatedRole)
            return StatusResponse(res, 500, "Cannot update role");
          return StatusResponse(res, 200, "OK", {
            role: copyObject(updatedRole, Attributes.Role),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddRole = (req, res, next) => {
  // Populate the role properties
  const roleToAdd = new Role();
  roleToAdd.name = req.body.name;
  roleToAdd.description = req.body.description;
  roleToAdd.id = UUID("role");
  roleToAdd.creator = req.authUserId;

  // Check for a role with the same name
  Role.findOne({ where: { name: roleToAdd.name } })
    .then((foundRole) => {
      if (foundRole) return StatusResponse(res, 421, "Role exists");

      // Save the role to the database
      roleToAdd
        .save()
        .then((addedRole) => {
          if (!addedRole) return StatusResponse(res, 500, "Cannot add role");

          return StatusResponse(res, 200, "OK", {
            role: copyObject(addedRole, Attributes.Role),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddCapToRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const capaToFind = req.params.capabilityId;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!capaToFind) return StatusResponse(res, 421, "No capability ID provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      // Check to make sure the current user isn't trying to change their own capabilities
      UserRole.findOne({
        where: { userId: req.authUserId, roleId: roleToFind },
      })
        .then((foundUserRole) => {
          if (foundUserRole)
            return StatusResponse(res, 421, "Cannot update own capabilities");

          Capability.findByPk(capaToFind)
            .then((capaFound) => {
              if (!capaFound)
                return StatusResponse(res, 404, "Capability not found");

              Role.belongsToMany(Capability, { through: RoleCapability });
              foundRole
                .addCapability(capaFound, {
                  through: {
                    id: UUID("rolecapability"),
                    creator: req.authUserId,
                  },
                })
                .then((addedCapa) => {
                  if (!addedCapa)
                    return StatusResponse(
                      res,
                      500,
                      "Cannot add capability to role"
                    );

                  return StatusResponse(res, 200, "OK");
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteCapFromRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const capaToFind = req.params.capabilityId;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!capaToFind) return StatusResponse(res, 421, "No capability ID provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      // Check to make sure the current user isn't trying to change their own capabilities
      UserRole.findOne({
        where: { userId: req.authUserId, roleId: roleToFind },
      })
        .then((foundUserRole) => {
          if (foundUserRole)
            return StatusResponse(res, 421, "Cannot update own capabilities");

          Capability.findByPk(capaToFind)
            .then((capaFound) => {
              if (!capaFound)
                return StatusResponse(res, 404, "Capability not found");

              Role.belongsToMany(Capability, { through: RoleCapability });
              foundRole
                .removeCapability(capaFound)
                .then((removedCapa) => {
                  if (!removedCapa)
                    return StatusResponse(
                      res,
                      500,
                      "Cannot delete capability from role"
                    );
                  return StatusResponse(res, 200, "OK");
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddUserToRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const userToFind = req.params.userId;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      // Check to make sure the current user isn't trying to change their own capabilities
      UserRole.findOne({
        where: { userId: req.authUserId, roleId: roleToFind },
      })
        .then((foundUserRole) => {
          if (foundUserRole)
            return StatusResponse(res, 421, "Cannot update own capabilities");

          whereCondition.id = userToFind;
          User.findOne({ where: whereCondition })
            .then((foundUser) => {
              if (!foundUser) return StatusResponse(res, 404, "User not found");

              User.belongsToMany(Role, { through: UserRole });
              foundUser
                .addRole(foundRole, {
                  through: {
                    id: UUID("userrole"),
                    creator: req.authUserId,
                  },
                })
                .then((addedUser) => {
                  if (!addedUser)
                    return StatusResponse(res, 500, "Cannot add user to role");
                  return StatusResponse(res, 200, "OK");
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteUserFromRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const userToFind = req.params.userId;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      whereCondition.id = userToFind;
      User.findOne({ where: whereCondition })
        .then((foundUser) => {
          if (!foundUser) return StatusResponse(res, 404, "User not found");

          User.belongsToMany(Role, { through: UserRole });
          foundUser
            .removeRole(foundRole)
            .then((removedUser) => {
              if (!removedUser)
                return StatusResponse(res, 500, "Cannot delete user from role");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

// Bulk-add functions
module.exports.putBulkAddCapToRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const capaList = req.body.capabilityList;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!capaList) return StatusResponse(res, 421, "No capability list provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition }).then((foundRole) => {
    if (!foundRole) return StatusResponse(res, 404, "Role not found");

    // Check to make sure the current user isn't trying to change their own capabilities
    UserRole.findOne({
      where: { userId: req.authUserId, roleId: roleToFind },
    }).then(async (foundUserRole) => {
      if (foundUserRole) {
        return StatusResponse(res, 421, "Cannot update own capabilities");
      }

      // Work through the list of capabilities
      const results = [];
      for (capaToFind of capaList) {
        await Capability.findByPk(capaToFind)
          .then(async (capaFound) => {
            if (!capaFound) {
              results.push({
                id: capaToFind,
                status: 404,
                message: "Capability not found",
              });
            } else {
              Role.belongsToMany(Capability, { through: RoleCapability });
              const throughOption = {
                through: {
                  id: UUID("rolecapability"),
                  creator: req.authUserId,
                },
              };
              await foundRole
                .addCapability(capaFound, throughOption)
                .then((addedCapa) => {
                  if (!addedCapa) {
                    results.push({
                      id: capaToFind,
                      status: 500,
                      message: "Cannot add to role",
                    });
                  } else {
                    results.push({
                      id: capaToFind,
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
  });
};

module.exports.deleteBulkCapFromRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const capList = req.body.capabilityList;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!capList) return StatusResponse(res, 421, "No capability list provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      // Check to make sure the current user isn't trying to change their own capabilities
      UserRole.findOne({
        where: { userId: req.authUserId, roleId: roleToFind },
      })
        .then(async (foundUserRole) => {
          if (foundUserRole) {
            return StatusResponse(res, 421, "Cannot update own capabilities");
          }

          const results = [];
          for (capaToFind of capList) {
            await Capability.findByPk(capaToFind)
              .then(async (capaFound) => {
                if (!capaFound) {
                  results.push({
                    id: capaToFind,
                    status: 404,
                    message: "Capability not found",
                  });
                } else {
                  Role.belongsToMany(Capability, { through: RoleCapability });
                  await foundRole
                    .removeCapability(capaFound)
                    .then((removedCapa) => {
                      if (!removedCapa) {
                        results.push({
                          id: capaToFind,
                          status: 500,
                          message: "Cannot delete capability from role",
                        });
                      } else {
                        results.push({
                          id: capaToFind,
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
    })
    .catch((err) => next(err));
};

module.exports.putBulkAddUserToRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const initialUserList = req.body.userList;
  let userList;

  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!initialUserList)
    return StatusResponse(res, 421, "No user list provided");

  userList = Array.isArray(initialUserList)
    ? initialUserList
    : [initialUserList];

  if (!Array.isArray(userList))
    return StatusResponse(res, 421, "userList is not an array");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then((foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      // Check to make sure the current user isn't trying to change their own capabilities
      UserRole.findOne({
        where: { userId: req.authUserId, roleId: roleToFind },
      })
        .then(async (foundUserRole) => {
          if (foundUserRole)
            return StatusResponse(res, 421, "Cannot update own capabilities");

          const results = [];
          for (user of userList) {
            await User.findByPk(user)
              .then(async (foundUser) => {
                if (!foundUser) {
                  results.push({
                    id: user,
                    status: 404,
                    message: "User not found",
                  });
                } else {
                  User.belongsToMany(Role, { through: UserRole });
                  const throughOptions = {
                    through: { id: UUID("userrole"), creator: req.authUserId },
                  };
                  await foundUser
                    .addRole(foundRole, throughOptions)
                    .then((addedUser) => {
                      if (!addedUser) {
                        results.push({
                          id: user,
                          status: 500,
                          message: "Cannot add user to role",
                        });
                      } else {
                        results.push({ id: user, status: 200, message: "OK" });
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
    })
    .catch((err) => next(err));
};

module.exports.deleteBulkUserFromRole = (req, res, next) => {
  const roleToFind = req.params.roleId;
  const userList = req.body.userList;
  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");
  if (!userList) return StatusResponse(res, 421, "No user list provided");

  let whereCondition = { id: roleToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Role.findOne({ where: whereCondition })
    .then(async (foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      const results = [];

      for (user of userList) {
        await User.findByPk(user)
          .then(async (foundUser) => {
            if (!foundUser) {
              results.push({
                id: user,
                status: 404,
                message: "User not found",
              });
            } else {
              User.belongsToMany(Role, { through: UserRole });
              await foundUser
                .removeRole(foundRole)
                .then((removedUser) => {
                  if (!removedUser) {
                    results.push({
                      id: user,
                      status: 500,
                      message: "Cannot delete user freom role",
                    });
                  } else {
                    results.push({ id: user, status: 200, message: "OK" });
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

exports.deleteRole = async (req, res, next) => {
  const roleToFind = req.params.roleId;

  if (!roleToFind) return StatusResponse(res, 421, "No role ID provided");

  Role.findByPk(roleToFind)
    .then(async (foundRole) => {
      if (!foundRole) return StatusResponse(res, 404, "Role not found");

      if( foundRole.protected === true ) return StatusResponse(res, 421, "Cannot delete protected role");

      // Ownership check if the curent user is NOT an admin
      if (
        !Security.getVerdict(req.verdicts, "delete").isAdmin &&
        !Security.isOwner(req.authUserId, foundRole)
      ) {
        return StatusResponse(res, 421, "Not owner");
      }

      // Check that the user isn't trying to delete a role they are part of
      UserRole.findOne({
        where: { userId: req.authUserId, roleId: roleToFind },
      }).then((foundUserRole) => {
        if (foundUserRole)
          return StatusResponse(
            res,
            421,
            "Cannot delete a role user is assigned to"
          );

        foundRole
          .destroy({ options: { cascade: true } })
          .then((destroyedRole) => {
            if (!destroyedRole)
              return res
                .status(500)
                .json({ status: 500, message: "Cannot delete role" });
            return res.status(200).json({ status: 200, message: "OK" });
          })
          .catch((err) => next(err));
      });
    })
    .catch((err) => next(err));
};

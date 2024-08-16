const Util = require("util");

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject } = require("../util/helpers");
const Config = require("../config/wotlwedu");

const { Op } = require("sequelize");

const Role = require("../model/role");
const Capability = require("../model/capability");
const RoleCapability = require("../model/rolecapability");

const Attributes = require("../model/attributes")

module.exports.getCapability = (req, res, next) => {
  const capToFind = req.params.capId;
  if (!capToFind) return StatusResponse(421, "No capability ID provided");

  const options = {};
  const whereCondition = {};

  whereCondition.id = capToFind;

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = [
    {
      model: Role,
      attributes: Attributes.Role,
      through: { attributes: [] },
    },
  ];

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Capability;

  Capability.findOne(options)
    .then((foundCap) => {
      if (!foundCap) return StatusResponse(res, 404, "Capability not found");

      return StatusResponse(res, 200, "OK", { capability: foundCap });
    })
    .catch((err) => next(err));
};

module.exports.getAllCapability = (req, res, next) => {
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
  options.where = whereCondition;
  options.attributes = Attributes.Capability;
  options.distinct = true;

  Capability.findAndCountAll(options)
    .then(({ count, rows }) => {
      if (!rows) {
        return StatusResponse(res, 200, "OK", {
          total: 0,
          page: 1,
          itemsPerPage: itemsPerPage,
          capabilities: [],
        });
      }

      return StatusResponse(res, 200, "OK", {
        total: count,
        page: page,
        itemsPerPage: itemsPerPage,
        capabilities: rows,
      });
    })
    .catch((err) => next(err));
};

module.exports.postUpdateCapability = (req, res, next) => {
  const capToFind = req.params.capId;
  if (!capToFind) return StatusResponse(res, 421, "No capability ID provided");

  let whereCondition = {};

  whereCondition.id = capToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }
  Capability.findOne({ where: whereCondition })
    .then((foundCap) => {
      if (!foundCap) return StatusResponse(res, 404, "Capability not found");

      if (req.body.name) foundCap.name = req.body.name;

      foundCap
        .save()
        .then((updatedCap) => {
          if (!updatedCap)
            return StatusResponse(res, 500, "Unable to update capability");

          return StatusResponse(res, 200, "OK", "Capability updated", {
            capability: copyObject(updatedCap, Attributes.Capability),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddCapability = (req, res, next) => {
  if (!req.body.name)
    return StatusResponse(res, 421, "No capability name provided");

  // Populate the capability properties
  const capToAdd = new Capability();
  capToAdd.name = req.body.name;
  capToAdd.id = UUID("capability");
  capToAdd.creator = req.authUserId;

  // Check for a capability with the same name
  Capability.findOne({ where: { name: capToAdd.name } })
    .then((foundCap) => {
      if (foundCap)
        return StatusResponse(res, 421, "Capability already exists");

      // Save the capability to the database
      capToAdd
        .save()
        .then((addedCap) => {
          if (!addedCap)
            return StatusResponse(res, 500, "Cannot add capability");

          return StatusResponse(res, 200, "OK", {
            capability: copyObject(addedCap, Attributes.Capability),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteCapability = (req, res, next) => {
  const capToFind = req.params.capId;
  if (!capToFind) return StatusResponse(res, 421, "No capability ID provided");

  let whereCondition = { id: capToFind };

  if (!deleteVerdict.isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Capability.findOne({ where: whereCondition })
    .then((foundCap) => {
      if (!foundCap) return StatusResponse(res, 404, "Capability not found");

      // Halt if the capability is being used in any role
      RoleCapability.findOne({ where: { capabilityId: capToFind } })
        .then((foundRoleCapability) => {
          if (foundRoleCapability)
            return StatusResponse(res, 421, "Capability in use");

          Capability.findByPk(capToFind)
            .then((foundCap) => {
              if (!foundCap)
                return StatusResponse(res, 404, "Capability not found");

              foundCap
                .destroy()
                .then((removedCapa) => {
                  if (!removedCapa)
                    return StatusResponse(res, 500, "Cannot delete capability");

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

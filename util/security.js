const Util = require("util");
const JWT = require("jsonwebtoken");
const Sequelize = require("sequelize");

const Config = require("../config/wotlwedu");

const StatusResponse = require("./statusresponse");

const User = require("../model/user");
const Capability = require("../model/capability");
const Group = require("../model/group");
const Role = require("../model/role");
const UserRole = require("../model/userrole");

function findCap(capList, cap) {
  const capUnit = cap.split(".");
  if (!capList) return null;
  return capList.find(
    (e) =>
      e.objectType === capUnit[0] &&
      e.operation === capUnit[1] &&
      e.scope === capUnit[2]
  );
}

async function getUserCaps(userToCheck) {
  const whereCondition = { userId: userToCheck };
  const includes = [
    { model: User, attributes: ["id"] },
    {
      model: Role,
      attributes: ["id"],
      include: { model: Capability, attributes: ["name"] },
    },
  ];
  const options = {};
  options.where = whereCondition;
  options.include = includes;
  let currentCaps = [];

  await UserRole.findAll(options).then((foundUserRoles) => {
    for (const userrole of foundUserRoles) {
      if (userrole.role) {
        if (userrole.role.capabilities) {
          for (const capa of userrole.role.capabilities) {
            const capUnit = capa.name.split(".");
            const obj = capUnit[0];
            const op = capUnit[1];
            const scope = capUnit[2];

            const cap = { objectType: obj, operation: op, scope: scope };

            if (!(cap in currentCaps)) {
              currentCaps.push(cap);
            }
          }
        }
      }
    }
  });

  return currentCaps;
}

// From a checkCapability verdict list, get specific verdict for the op
module.exports.getVerdict = (verdicts, op) => {
  let verdict = { op: "none", isAuthorized: false, isAdmin: false };

  if (verdicts && op) {
    const foundVerdict = verdicts.find((v) => v.op === op);
    if (foundVerdict) verdict = foundVerdict;
  }

  return verdict;
};

// Check that the user is the owner of the.objectType
module.exports.isOwner = (userid, object) => {
  if (!userid) return false;
  if (!object) return false;
  if (!object.creator) return false;

  return object.creator.toString() === userid.toString();
};

module.exports.bypassCheck = (req, res, next) => {
  req.bypassAuthCheck = true;
  next();
};

// Middleware function to check for the presence of an authentication
// token and verify it
module.exports.checkAuthentication = async (req, res, next) => {
  const authHeader = req.get("Authorization");
  let token = authHeader;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token && req.bypassAuthCheck) {
    req.bypassAuthCheck = false;
    return next();
  }

  if (!token) {
    return StatusResponse(res, 403, "No Authorization header");
  }

  try {
    const decoded = JWT.verify(token, Config.jwtSecret);
    const options = {};
    options.attributes = [
      "id",
      "active",
      [
        Sequelize.fn(
          "CONCAT",
          Sequelize.col("firstName"),
          " ",
          Sequelize.col("lastName")
        ),
        "fullName",
      ],
      "admin",
      "systemAdmin",
      "organizationId",
      "organizationAdmin",
      "workgroupAdmin",
      "adminGroupId",
    ];
    options.raw = true;

    // Check to see if the user is active
    const foundUser = await User.findByPk(decoded.user, options);

    if (!foundUser) {
      return StatusResponse(res, 403, "Invalid authentication token");
    }

    if (!foundUser.active) return StatusResponse(res, 403, "Account disabled");

    //Save the user ID in the req object
    req.authUserId = decoded.user;
    req.authName = foundUser.fullName;
    const isSystemAdmin = foundUser.systemAdmin === true || foundUser.admin === true;
    req.isSystemAdmin = isSystemAdmin;
    req.isAdmin = isSystemAdmin;
    req.authOrganizationId = foundUser.organizationId || null;
    req.isOrganizationAdmin = foundUser.organizationAdmin === true;
    req.isWorkgroupAdmin = foundUser.workgroupAdmin === true;
    req.adminWorkgroupId = foundUser.adminGroupId || null;

    next();
  } catch (err) {
    return StatusResponse(res, 401, "Not authenticated", {
      message: err.message,
    });
  }
};

module.exports.applyOrganizationScope = (req, whereCondition, field = "organizationId") => {
  if (!whereCondition) whereCondition = {};
  if (!req) return whereCondition;
  if (req.isAdmin === true) return whereCondition;
  if (!req.authOrganizationId) return whereCondition;
  whereCondition[field] = req.authOrganizationId;
  return whereCondition;
};

module.exports.isInSameOrganization = (req, objectWithOrganizationId) => {
  if (!req || !objectWithOrganizationId) return false;
  if (req.isAdmin === true) return true;
  if (!req.authOrganizationId) return false;
  return req.authOrganizationId === objectWithOrganizationId.organizationId;
};

module.exports.canManageWorkgroup = (req, group) => {
  if (!req || !group) return false;
  if (req.isAdmin === true) return true;
  if (!req.authOrganizationId) return false;
  if (group.organizationId !== req.authOrganizationId) return false;
  if (req.isOrganizationAdmin === true) return true;
  if (req.isWorkgroupAdmin === true && req.adminWorkgroupId) {
    return req.adminWorkgroupId === group.id;
  }
  return false;
};

module.exports.canManageUserInWorkgroup = async (req, groupId) => {
  if (!groupId) return false;
  const group = await Group.findByPk(groupId, { raw: true });
  if (!group) return false;
  return module.exports.canManageWorkgroup(req, group);
};

module.exports.checkCapability = function (objectToCheck, opList) {
  return async function (req, res, next) {
    const userId = req.authUserId;
    if (!userId) {
      const error = new Error("No user ID provided");
      error.statusCode = 403;
      throw error;
    }

    const userCaps = await getUserCaps(userId);
    const objName = objectToCheck;
    req.verdicts = [];

    if (opList) {
      for (const op of opList) {
        let isAdmin = false;
        let isAuthorized = false;
        if (
          findCap(userCaps, "all.manage.admin") ||
          findCap(userCaps, "all." + op + ".admin") ||
          findCap(userCaps, objName + ".manage.admin") ||
          findCap(userCaps, objName + "." + op + ".admin")
        ) {
          isAdmin = true;
          isAuthorized = true;
        } else {
          if (
            findCap(userCaps, "all.manage.owner") ||
            findCap(userCaps, "all." + op + ".owner") ||
            findCap(userCaps, objName + ".manage.owner") ||
            findCap(userCaps, objName + "." + op + ".owner")
          ) {
            isAuthorized = true;
          }
        }

        req.verdicts.push({
          op: op,
          isAuthorized: isAuthorized,
          isAdmin: isAdmin,
        });

        if (!isAuthorized) {
          const error = new Error("Not authorized");
          error.statusCode = 403;
          next(error);
        }
      }
    }
    next();
  };
};

module.exports.logVerdicts = (req, res, next) => {
  if (req.verdicts) {
    console.log("Security Verdicts: " + Util.inspect(req.verdicts));
  }
  next();
};

const Util = require("util");
const JWT = require("jsonwebtoken");
const Sequelize = require("sequelize");

const Config = require("../config/wotlwedu");

const StatusResponse = require("./statusresponse");

const User = require("../model/user");
const Capability = require("../model/capability");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");
const Role = require("../model/role");
const UserRole = require("../model/userrole");

function toBool(v) {
  // Sequelize/MySQL/MariaDB can return booleans as 0/1 (or occasionally '0'/'1') when using `raw: true`.
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1") return true;
    if (s === "0") return false;
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (Buffer.isBuffer(v) && v.length === 1) return v[0] === 1;
  return !!v;
}

// Expose for unit tests (not part of public API contract).
module.exports._toBool = toBool;

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
      "adminWorkgroupId",
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
    const isSystemAdmin = toBool(foundUser.systemAdmin) || toBool(foundUser.admin);
    req.isSystemAdmin = isSystemAdmin;
    req.isAdmin = isSystemAdmin;
    req.authOrganizationId = foundUser.organizationId || null;
    req.isOrganizationAdmin = toBool(foundUser.organizationAdmin);
    req.isWorkgroupAdmin = toBool(foundUser.workgroupAdmin);
    req.adminWorkgroupId =
      foundUser.adminWorkgroupId || foundUser.adminGroupId || null;

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

module.exports.canManageWorkgroup = (req, workgroup) => {
  if (!req || !workgroup) return false;
  if (req.isAdmin === true) return true;
  if (!req.authOrganizationId) return false;
  if (workgroup.organizationId !== req.authOrganizationId) return false;
  if (req.isOrganizationAdmin === true) return true;
  if (req.isWorkgroupAdmin === true && req.adminWorkgroupId) {
    return req.adminWorkgroupId === workgroup.id;
  }
  return false;
};

module.exports.canManageUserInWorkgroup = async (req, workgroupId) => {
  if (!workgroupId) return false;
  const workgroup = await Workgroup.findByPk(workgroupId, { raw: true });
  if (!workgroup) return false;
  return module.exports.canManageWorkgroup(req, workgroup);
};

module.exports.isMemberOfWorkgroup = async (userId, workgroupId) => {
  if (!userId || !workgroupId) return false;
  const found = await WorkgroupMember.findOne({
    where: { userId: userId, workgroupId: workgroupId },
    raw: true,
  });
  return !!found;
};

module.exports.canAccessWorkgroup = async (req, workgroupOrId) => {
  if (!req || !workgroupOrId) return false;
  if (req.isAdmin === true) return true;

  const workgroup =
    typeof workgroupOrId === "string"
      ? await Workgroup.findByPk(workgroupOrId, { raw: true })
      : workgroupOrId;

  if (!workgroup) return false;
  if (!req.authOrganizationId) return false;
  if (workgroup.organizationId !== req.authOrganizationId) return false;

  // Org admins can access all workgroups in their org.
  if (req.isOrganizationAdmin === true) return true;

  // Workgroup admins are restricted to their admin workgroup.
  if (req.isWorkgroupAdmin === true && req.adminWorkgroupId) {
    return req.adminWorkgroupId === workgroup.id;
  }

  // Regular users: membership check.
  return await module.exports.isMemberOfWorkgroup(req.authUserId, workgroup.id);
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

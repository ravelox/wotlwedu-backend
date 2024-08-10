const Util = require("util");
const JWT = require("jsonwebtoken");
const Sequelize = require("sequelize");

const Config = require("../config/wotlwedu");

const StatusResponse = require("./statusresponse");

const User = require("../model/user");
const Capability = require("../model/capability");
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
    for (userrole of foundUserRoles) {
      if (userrole.role) {
        if (userrole.role.capabilities) {
          for (capa of userrole.role.capabilities) {
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
  const token = req.get("Authorization");

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
    req.isAdmin = foundUser.admin;

    next();
  } catch (err) {
    return StatusResponse(res, 401, "Not authenticated", {
      message: err.message,
    });
  }
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
      for (op of opList) {
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

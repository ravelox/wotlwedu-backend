const module_id = "update-0003";
const module_comment = "Add intial roles";

const Util = require("util");

const Config = require("../config/wotlwedu");
const database = require("../util/database");

const User = require("../model/user");
const Role = require("../model/role");
const Capability = require("../model/capability");

const UUID = require("../util/mini-uuid");

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;

async function createRole(rolename, description, capabilityList) {
  let role = await Role.findOne({ where: { name: rolename } });

  if (!role) {
    console.log(module_id + ": Adding role: '" + rolename + "'");
    const r = {
      id: UUID("role"),
      name: rolename,
      description: description,
      protected: true,
      creator: "system",
    };
    // Create the Root Role
    role = await Role.create(r);
  }

  for (capname of capabilityList) {
    console.log(module_id + ": Adding  " + capname + " to " + role.name);
    const capaToAdd = await Capability.findOne({ where: { name: capname } });
    await role.addCapability(capaToAdd, {
      through: { id: UUID("rolecap"), creator: "system" },
    });
  }
}

async function addUserToRole(alias, rolename) {
  console.log(module_id + ": Looking for '" + rolename + "'");
  const role = await Role.findOne({ where: { name: rolename } });

  if (!role)
    return { status: -1, message: "Cannot find a role '" + rolename + "'" };

  console.log( Util.inspect( User, {depth: null }))

  const foundUser = await User.findOne({ where: { alias: alias } });
  if (!foundUser)
    return { status: -1, message: "No user '" + alias + "' has been found" };

  try {
    console.log(module_id + ": Adding '" + alias + "' to '" + rolename + "'");
    await foundUser.addRole(role, {
      through: { id: UUID("userrole"), creator: "system" },
    });
    return { status: 0, message: "OK" };
  } catch (err) {
    console.log(err);
    return { status: -1, message: err };
  }
}

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log(module_id + ": Initialising");
  _queryInterface = queryInterface;

  return { status: 0, message: "OK" };
}

function cleanup() {
  console.log(module_id + ": Cleaning");
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  const rootRoleName = Config.rootRoleName || "Root Role";
  const defaultRoleName = Config.defaultRoleName || "Default Role";

  let result;
  result = await createRole(rootRoleName, "Role for root user", [
    "all.manage.admin",
  ]);

  if (result && result.status && result.status !== 0) {
    console.log(module_id + ": Failed to create role '" + rootRoleName + "'");
  }

  result = await createRole(defaultRoleName, "Default Role for all users", [
    "all.manage.owner",
  ]);
  if (result && result.status && result.status !== 0) {
    console.log(
      module_id + ": Failed to create role '" + defaultRoleName + "'"
    );
  }
  result = await addUserToRole("root", rootRoleName);
  if (result && result.status && result.status !== 0) {
    console.log(
      module_id + ": Failed to add 'root' user to role '" + rootRoleName + "'"
    );
  }

  return {
    status: 0,
    message: "OK",
  };
}

function remove(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  return { status: 0, message: "OK" };
}

function dryRun() {
  this.apply(false);
  this.remove(false);
}

module.exports.init = init;
module.exports.cleanup = cleanup;
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;

const module_id = "update-0008";
const module_comment =
  "Add organization/workgroup capabilities and assign to Root Role";
const module_target_database_version = 9;

const Config = require("../config/wotlwedu");

const UUID = require("../util/mini-uuid");
const Capability = require("../model/capability");
const Role = require("../model/role");

const capabilityObjects = ["organization", "workgroup"];
const operations = ["manage", "delete", "edit", "add", "view"];
const scopes = ["admin", "owner"];

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function genCapabilityNames() {
  const names = [];
  for (const objectType of capabilityObjects) {
    for (const operation of operations) {
      for (const scope of scopes) {
        names.push([objectType, operation, scope].join("."));
      }
    }
  }
  return names;
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

async function ensureCapability(name) {
  let capability = await Capability.findOne({ where: { name: name } });
  if (capability) return capability;

  capability = await Capability.create({
    id: UUID("capa"),
    name: name,
    creator: "system",
  });
  return capability;
}

async function isApplied() {
  try {
    const rootRoleName = Config.rootRoleName || "Root Role";
    const rootRole = await Role.findOne({ where: { name: rootRoleName } });
    if (!rootRole) return { status: 0, applied: false };

    const capabilityNames = genCapabilityNames();
    const foundCapabilities = await Capability.findAll({
      where: { name: capabilityNames },
    });
    if (foundCapabilities.length !== capabilityNames.length) {
      return { status: 0, applied: false };
    }

    for (const cap of foundCapabilities) {
      const hasCap = await rootRole.hasCapability(cap);
      if (!hasCap) {
        return { status: 0, applied: false };
      }
    }

    return { status: 0, applied: true };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  try {
    const rootRoleName = Config.rootRoleName || "Root Role";
    const rootRole = await Role.findOne({ where: { name: rootRoleName } });
    if (!rootRole) {
      return {
        status: -1,
        message: "Root role not found: " + rootRoleName,
      };
    }

    const capabilityNames = genCapabilityNames();
    for (const name of capabilityNames) {
      const capability = await ensureCapability(name);
      const hasCap = await rootRole.hasCapability(capability);
      if (!hasCap) {
        await rootRole.addCapability(capability, {
          through: { id: UUID("rolecap"), creator: "system" },
        });
      }
    }
  } catch (err) {
    return { status: -1, message: err };
  }

  return { status: 0, message: "OK" };
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
module.exports.isApplied = isApplied;
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;

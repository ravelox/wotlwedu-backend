const module_id = "update-0021";
const module_comment = "Ensure default organization tenancy data";
const module_target_database_version = 22;

const Organization = require("../model/organization");
const User = require("../model/user");
const Workgroup = require("../model/workgroup");

const DEFAULT_ORGANIZATION_ID = "org_default";

let _queryInterface;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  _queryInterface = queryInterface;
  console.log(module_id + ": Initialising");
  return { status: 0, message: "OK" };
}

function cleanup() {
  console.log(module_id + ": Cleaning");
}

async function isApplied() {
  try {
    const defaultOrganization = await Organization.findByPk(DEFAULT_ORGANIZATION_ID);
    const peopleWithoutOrganization = await User.count({ where: { organizationId: null } });
    const spacesWithoutOrganization = await Workgroup.count({ where: { organizationId: null } });

    return {
      status: 0,
      applied: !!defaultOrganization && peopleWithoutOrganization === 0 && spacesWithoutOrganization === 0,
    };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function apply() {
  if (!_queryInterface) {
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };
  }

  try {
    await Organization.sync();

    const foundDefaultOrganization = await Organization.findByPk(DEFAULT_ORGANIZATION_ID);
    if (!foundDefaultOrganization) {
      await Organization.create({
        id: DEFAULT_ORGANIZATION_ID,
        name: "Default Organization",
        description: "Auto-created default tenant",
        active: true,
        creator: "system",
      });
    }

    await User.update(
      { organizationId: DEFAULT_ORGANIZATION_ID },
      { where: { organizationId: null } }
    );

    await Workgroup.update(
      { organizationId: DEFAULT_ORGANIZATION_ID },
      { where: { organizationId: null } }
    );

    return { status: 0, message: "OK" };
  } catch (err) {
    console.log(err);
    return { status: -1, message: err };
  }
}

function remove() {
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

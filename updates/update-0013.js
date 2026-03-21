const module_id = "update-0013";
const module_comment = "Add social identity and organization invite tables";
const module_target_database_version = 14;

const OrganizationInvite = require("../model/organizationinvite");
const SocialIdentity = require("../model/socialidentity");

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  _queryInterface = queryInterface;
  return { status: 0, message: "OK" };
}

function cleanup() {
  return { status: 0, message: "OK" };
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    await queryInterface.describeTable("socialidentities");
    await queryInterface.describeTable("organizationinvites");
    return { status: 0, applied: true };
  } catch {
    return { status: 0, applied: false };
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
    await SocialIdentity.sync();
    await OrganizationInvite.sync();
  } catch (err) {
    return { status: -1, message: err };
  }

  return { status: 0, message: "OK" };
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

const module_id = "update-0012";
const module_comment = "Add test token table for admin-issued test JWT revocation";
const module_target_database_version = 13;

const TestToken = require("../model/testtoken");

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log("Initialising module [" + module_id + "]");
  _queryInterface = queryInterface;
  return { status: 0, message: "OK" };
}

function cleanup() {
  console.log("Cleaning module [" + module_id + "]");
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    await queryInterface.describeTable("testtokens");
    return { status: 0, applied: true };
  } catch {
    return { status: 0, applied: false };
  }
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  try {
    await TestToken.sync();
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

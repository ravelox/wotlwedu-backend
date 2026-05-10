const module_id = "update-0022";
const module_comment = "Add shared rate limit counters";
const module_target_database_version = 23;

const RateLimit = require("../model/ratelimit");

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

async function isApplied(queryInterface) {
  try {
    const qi = queryInterface || _queryInterface;
    if (!qi) return { status: -1, message: "No query interface supplied" };
    const tables = await qi.showAllTables();
    const normalized = tables.map((entry) =>
      typeof entry === "string" ? entry : entry.tableName || entry.name
    );
    return { status: 0, applied: normalized.includes("ratelimits") };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function apply() {
  try {
    await RateLimit.sync();
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

const module_id = "update-0018";
const module_comment = "Add election participation reminder notification status";
const module_target_database_version = 19;

const Status = require("../model/status");

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

const statuses = [{ id: 110, object: "notification", name: "Election Participation Reminder" }];

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log(module_id + ": Initialising");
  return { status: 0, message: "OK" };
}

function cleanup() {
  console.log(module_id + ": Cleaning");
}

async function isApplied() {
  try {
    const foundStatusCount = await Status.count({
      where: { id: statuses.map((status) => status.id) },
    });
    return { status: 0, applied: foundStatusCount === statuses.length };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function apply() {
  for (const status of statuses) {
    try {
      const foundStatus = await Status.findOne({ where: { id: status.id } });
      if (!foundStatus) {
        await Status.create({ ...status, creator: "system" });
      }
    } catch (err) {
      console.log(err);
    }
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

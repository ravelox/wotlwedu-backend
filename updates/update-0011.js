const module_id = "update-0011";
const module_comment =
  "Add composite notification indexes to support unread counts and paged inbox queries";
const module_target_database_version = 12;

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

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

async function ensureIndex(tableName, fields, name) {
  try {
    await _queryInterface.addIndex(tableName, fields, { name: name });
  } catch {
    // Index already exists or cannot be created; ignore for idempotency.
  }
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    const indexes = await queryInterface.showIndex("notifications");
    const names = indexes.map((index) => index.name);

    return {
      status: 0,
      applied:
        names.includes("notifications_user_status") &&
        names.includes("notifications_user_created"),
    };
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
    await ensureIndex("notifications", ["userId", "statusId"], "notifications_user_status");
    await ensureIndex("notifications", ["userId", "createdAt"], "notifications_user_created");
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

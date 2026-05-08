const module_id = "update-0014";
const module_comment = "Add organization invite revoke metadata";
const module_target_database_version = 15;

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
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
    const desc = await queryInterface.describeTable("organizationinvites");
    return {
      status: 0,
      applied: !!desc.revokedAt && !!desc.revokedByUserId,
    };
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
    const desc = await _queryInterface.describeTable("organizationinvites");
    if (!desc.revokedByUserId) {
      await _queryInterface.addColumn("organizationinvites", "revokedByUserId", {
        type: "VARCHAR(255)",
        allowNull: true,
        defaultValue: null,
      });
    }
    if (!desc.revokedAt) {
      await _queryInterface.addColumn("organizationinvites", "revokedAt", {
        type: "DATETIME",
        allowNull: true,
        defaultValue: null,
      });
    }
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

const module_id = "update-0017";
const module_comment = "Add organization invite decline tracking";
const module_target_database_version = 18;

let _queryInterface = null;
let _sequelize = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function init(queryInterface, sequelize) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  _queryInterface = queryInterface;
  _sequelize = sequelize || { Sequelize: require("sequelize") };
  return { status: 0, message: "OK" };
}

function cleanup() {
  return { status: 0, message: "OK" };
}

async function hasColumn(tableName, columnName) {
  try {
    const table = await _queryInterface.describeTable(tableName);
    return !!table[columnName];
  } catch {
    return false;
  }
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    const table = await queryInterface.describeTable("organizationinvites");
    return {
      status: 0,
      applied: !!table.declinedByUserId && !!table.declinedAt,
    };
  } catch {
    return { status: 0, applied: false };
  }
}

async function ensureColumn(tableName, columnName, spec) {
  const exists = await hasColumn(tableName, columnName);
  if (!exists) {
    await _queryInterface.addColumn(tableName, columnName, spec);
  }
}

async function apply() {
  if (!_queryInterface || !_sequelize) {
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };
  }

  try {
    await ensureColumn("organizationinvites", "declinedByUserId", {
      type: _sequelize.Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await ensureColumn("organizationinvites", "declinedAt", {
      type: _sequelize.Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    try {
      await _queryInterface.addIndex("organizationinvites", ["organizationId", "declinedAt"]);
    } catch {
      // Ignore duplicate index attempts.
    }
    return { status: 0, message: "OK" };
  } catch (err) {
    return { status: -1, message: err.message };
  }
}

module.exports.init = init;
module.exports.cleanup = cleanup;
module.exports.isApplied = isApplied;
module.exports.apply = apply;

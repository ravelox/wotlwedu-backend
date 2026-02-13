const module_id = "update-0007";
const module_comment = "Add explicit system admin user classification";

const Sequelize = require("sequelize");

const User = require("../model/user");

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;

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

async function ensureColumn(tableName, columnName, definition) {
  const table = await _queryInterface.describeTable(tableName);
  if (!table[columnName]) {
    await _queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  try {
    await ensureColumn("users", "systemAdmin", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    });

    // Backfill existing global admins into explicit systemAdmin flag.
    await User.update(
      { systemAdmin: true },
      { where: { admin: true } }
    );

    // Keep root as system admin.
    await User.update(
      { systemAdmin: true, admin: true },
      { where: { alias: "root" } }
    );
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
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;

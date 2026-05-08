const Sequelize = require("sequelize");

const module_id = "update-0020";
const module_comment = "Widen preference values for structured tutorial state";
const module_target_database_version = 21;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

let _queryInterface;

async function getPreferenceTableDescription(queryInterface = _queryInterface) {
  if (!queryInterface) {
    throw new Error("No query interface supplied");
  }
  return queryInterface.describeTable("preferences");
}

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

async function isApplied(queryInterface = _queryInterface) {
  try {
    const table = await getPreferenceTableDescription(queryInterface);
    const valueType = String(table.value?.type || "").toLowerCase();
    return {
      status: 0,
      applied:
        valueType.includes("text") ||
        valueType.includes("mediumtext") ||
        valueType.includes("longtext"),
    };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function apply() {
  try {
    await _queryInterface.changeColumn("preferences", "value", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
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

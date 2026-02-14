const module_id = "update-0010";
const module_comment =
  "Add workgroupId to items, images, lists, and elections for workgroup-scoped administration";
const module_target_database_version = 11;

const Sequelize = require("sequelize");

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

async function ensureColumn(tableName, columnName, definition) {
  const table = await _queryInterface.describeTable(tableName);
  if (!table[columnName]) {
    await _queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function ensureIndex(tableName, fields) {
  try {
    await _queryInterface.addIndex(tableName, fields);
  } catch {
    // Index already exists or cannot be created; ignore for idempotency.
  }
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    const items = await queryInterface.describeTable("items");
    const images = await queryInterface.describeTable("images");
    const lists = await queryInterface.describeTable("lists");
    const elections = await queryInterface.describeTable("elections");
    return {
      status: 0,
      applied:
        !!items.workgroupId &&
        !!images.workgroupId &&
        !!lists.workgroupId &&
        !!elections.workgroupId,
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
    const colDef = {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    };

    await ensureColumn("items", "workgroupId", colDef);
    await ensureColumn("images", "workgroupId", colDef);
    await ensureColumn("lists", "workgroupId", colDef);
    await ensureColumn("elections", "workgroupId", colDef);

    await ensureIndex("items", ["workgroupId"]);
    await ensureIndex("images", ["workgroupId"]);
    await ensureIndex("lists", ["workgroupId"]);
    await ensureIndex("elections", ["workgroupId"]);
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


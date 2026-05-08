const module_id = "update-0019";
const module_comment = "Rename persisted terminology tables to people, circles, pictures, spaces, and polls";
const module_target_database_version = 20;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

let _queryInterface;

const tableRenames = [
  ["users", "people"],
  ["groups", "circles"],
  ["groupmembers", "circlemembers"],
  ["workgroups", "spaces"],
  ["workgroupmembers", "spacemembers"],
  ["images", "pictures"],
  ["elections", "polls"],
  ["userroles", "personroles"],
];

async function getTables(queryInterface = _queryInterface) {
  const tables = await queryInterface.showAllTables();
  return new Set(
    tables.map((table) => {
      if (typeof table === "string") return table;
      return table.tableName || table.name;
    })
  );
}

async function renameTerminologyTables(queryInterface = _queryInterface) {
  if (!queryInterface) {
    throw new Error("No query interface supplied");
  }

  for (const [oldName, newName] of tableRenames) {
    const tables = await getTables(queryInterface);
    const hasOld = tables.has(oldName);
    const hasNew = tables.has(newName);

    if (!hasOld) continue;
    if (hasNew) {
      throw new Error(
        `Cannot rename ${oldName} to ${newName}: both tables already exist`
      );
    }

    await queryInterface.renameTable(oldName, newName);
  }
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
    const tables = await getTables(queryInterface);
    const applied = tableRenames.every(([, newName]) => tables.has(newName));
    return { status: 0, applied };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function apply() {
  try {
    await renameTerminologyTables(_queryInterface);
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
module.exports.renameTerminologyTables = renameTerminologyTables;

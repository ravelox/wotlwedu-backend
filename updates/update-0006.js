const module_id = "update-0006";
const module_comment = "Add organization and workgroup tenancy fields";

const Sequelize = require("sequelize");

const Organization = require("../model/organization");
const User = require("../model/user");
const Group = require("../model/group");

const DEFAULT_ORGANIZATION_ID = "org_default";

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
    await Organization.sync();

    await ensureColumn("users", "organizationId", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await ensureColumn("users", "organizationAdmin", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    });
    await ensureColumn("users", "workgroupAdmin", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    });
    await ensureColumn("users", "adminGroupId", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await ensureColumn("groups", "organizationId", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    const foundDefaultOrganization = await Organization.findByPk(
      DEFAULT_ORGANIZATION_ID
    );
    if (!foundDefaultOrganization) {
      await Organization.create({
        id: DEFAULT_ORGANIZATION_ID,
        name: "Default Organization",
        description: "Auto-created default tenant",
        active: true,
        creator: "system",
      });
    }

    await User.update(
      { organizationId: DEFAULT_ORGANIZATION_ID },
      { where: { organizationId: null } }
    );

    const groups = await Group.findAll();
    for (const group of groups) {
      if (group.organizationId) continue;
      const foundUser = await User.findByPk(group.creator);
      group.organizationId =
        (foundUser && foundUser.organizationId) || DEFAULT_ORGANIZATION_ID;
      await group.save();
    }
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

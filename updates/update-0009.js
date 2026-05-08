const module_id = "update-0009";
const module_comment =
  "Split workgroups from groups: add workgroup tables + adminWorkgroupId";
const module_target_database_version = 10;

const Sequelize = require("sequelize");

const UUID = require("../util/mini-uuid");
const User = require("../model/user");
const Group = require("../model/group");
const GroupMember = require("../model/groupmember");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
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

async function hasTable(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    const hasWorkgroups = await hasTable(queryInterface, "workgroups");
    const hasWorkgroupMembers = await hasTable(queryInterface, "workgroupmembers");
    const userTable = await queryInterface.describeTable("users");
    const hasAdminWorkgroupId = !!userTable.adminWorkgroupId;
    return {
      status: 0,
      applied: hasWorkgroups && hasWorkgroupMembers && hasAdminWorkgroupId,
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
    // Add new adminWorkgroupId field for workgroup admins (keep adminGroupId for backward compat).
    await ensureColumn("users", "adminWorkgroupId", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    // Create new workgroup tables.
    await Workgroup.sync();
    await WorkgroupMember.sync();

    // Backfill adminWorkgroupId from legacy adminGroupId when present.
    await User.update(
      { adminWorkgroupId: Sequelize.col("adminGroupId") },
      { where: { adminWorkgroupId: null, adminGroupId: { [Sequelize.Op.not]: null } } }
    );

    // Migrate existing groups into workgroups (same id) to preserve historical data.
    const groups = await Group.findAll({ raw: true });
    for (const g of groups) {
      const existing = await Workgroup.findByPk(g.id);
      if (existing) continue;
      await Workgroup.create({
        id: g.id,
        name: g.name,
        description: g.description,
        categoryId: g.categoryId || null,
        organizationId: g.organizationId || null,
        listType: g.listType || 1,
        active: g.active === true,
        creator: g.creator || "system",
      });
    }

    // Migrate group membership to workgroup membership.
    const members = await GroupMember.findAll({ raw: true });
    for (const m of members) {
      const existing = await WorkgroupMember.findOne({
        where: { workgroupId: m.groupId, userId: m.userId },
      });
      if (existing) continue;
      await WorkgroupMember.create({
        id: UUID("workgroupmember"),
        workgroupId: m.groupId,
        userId: m.userId,
        active: m.active === true,
        creator: m.creator || "system",
      });
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
module.exports.isApplied = isApplied;
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;


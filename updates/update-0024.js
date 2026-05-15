const module_id = "update-0024";
const module_comment = "Ensure default organization non-admin user";
const module_target_database_version = 25;

const Config = require("../config/wotlwedu");
const Organization = require("../model/organization");
const Role = require("../model/role");
const User = require("../model/user");
const UUID = require("../util/mini-uuid");

const DEFAULT_ORGANIZATION_ID = "org_default";
const DEFAULT_USER_ID = "user_default";
const DEFAULT_USER_EMAIL = "user@localhost.localdomain";
const DEFAULT_USER_AUTH =
  "$2a$12$/EdTalpaN15.1E7MWntkj.xKAnKyStjXdNaLGNdmaDR1DC/y1HO6K";

let _queryInterface;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

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

async function isApplied() {
  try {
    const foundUser = await User.findByPk(DEFAULT_USER_ID);
    return {
      status: 0,
      applied: !!(
        foundUser &&
        foundUser.organizationId === DEFAULT_ORGANIZATION_ID &&
        foundUser.auth === DEFAULT_USER_AUTH &&
        foundUser.admin !== true &&
        foundUser.systemAdmin !== true &&
        foundUser.organizationAdmin !== true &&
        foundUser.workgroupAdmin !== true
      ),
    };
  } catch (err) {
    return { status: -1, message: err };
  }
}

async function ensureDefaultOrganization() {
  await Organization.sync();
  const foundOrganization = await Organization.findByPk(DEFAULT_ORGANIZATION_ID);
  if (foundOrganization) return foundOrganization;

  return Organization.create({
    id: DEFAULT_ORGANIZATION_ID,
    name: "Default Organization",
    description: "Auto-created default tenant",
    active: true,
    creator: "system",
  });
}

async function assignDefaultRole(user) {
  const defaultRoleName = Config.defaultRoleName || "Default Role";
  const defaultRole = await Role.findOne({ where: { name: defaultRoleName } });
  if (!defaultRole || typeof user.hasRole !== "function") return;

  const hasRole = await user.hasRole(defaultRole);
  if (hasRole) return;

  await user.addRole(defaultRole, {
    through: { id: UUID("userrole"), creator: "system" },
  });
}

async function apply() {
  if (!_queryInterface) {
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };
  }

  try {
    await ensureDefaultOrganization();
    await User.sync();

    let defaultUser = await User.findByPk(DEFAULT_USER_ID);
    if (!defaultUser) {
      defaultUser = await User.create({
        id: DEFAULT_USER_ID,
        firstName: "Default",
        lastName: "User",
        alias: "default",
        email: DEFAULT_USER_EMAIL,
        auth: DEFAULT_USER_AUTH,
        organizationId: DEFAULT_ORGANIZATION_ID,
        creator: "system",
        active: true,
        verified: true,
        admin: false,
        systemAdmin: false,
        organizationAdmin: false,
        workgroupAdmin: false,
        protected: false,
      });
    } else {
      defaultUser.organizationId = DEFAULT_ORGANIZATION_ID;
      defaultUser.auth = DEFAULT_USER_AUTH;
      defaultUser.admin = false;
      defaultUser.systemAdmin = false;
      defaultUser.organizationAdmin = false;
      defaultUser.workgroupAdmin = false;
      defaultUser.protected = false;
      defaultUser.active = true;
      defaultUser.verified = true;
      await defaultUser.save();
    }

    await assignDefaultRole(defaultUser);

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

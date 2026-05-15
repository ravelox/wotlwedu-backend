const { Op } = require("sequelize");

const Config = require("../config/wotlwedu");
const database = require("../util/database");
const Associations = require("../model/associations");

const Organization = require("../model/organization");
const Session = require("../model/session");
const User = require("../model/user");
const UserRole = require("../model/userrole");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");

Associations.setup();

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function whereLike(column, pattern) {
  return { [column]: { [Op.like]: pattern } };
}

async function countRows(prefix, includeSysadmin) {
  const userWhere = {
    [Op.or]: [
      whereLike("id", `${prefix}_user_%`),
      ...(includeSysadmin ? [{ id: `${prefix}_sysadmin` }] : []),
    ],
  };

  const [organizations, spaces, users, userRoles, spaceMemberships, sessions] =
    await Promise.all([
      Organization.count({ where: whereLike("id", `${prefix}_org_%`) }),
      Workgroup.count({ where: whereLike("id", `${prefix}_space_%`) }),
      User.count({ where: userWhere }),
      UserRole.count({ where: whereLike("userId", `${prefix}_user_%`) }),
      WorkgroupMember.count({ where: whereLike("id", `${prefix}_spacemember_%`) }),
      Session.count({
        where: {
          [Op.or]: [
            whereLike("userId", `${prefix}_user_%`),
            ...(includeSysadmin ? [{ userId: `${prefix}_sysadmin` }] : []),
          ],
        },
      }),
    ]);

  return { organizations, spaces, users, userRoles, spaceMemberships, sessions };
}

async function destroyRows(Model, options, label) {
  const count = await Model.destroy(options);
  console.log(`Deleted ${count} ${label}`);
  return count;
}

async function main() {
  const prefix = process.env.WOTLWEDU_SEED_PREFIX || "scale";
  const dryRun = boolEnv("WOTLWEDU_RESET_DRY_RUN", false);
  const includeSysadmin = boolEnv("WOTLWEDU_RESET_INCLUDE_SYSADMIN", true);
  const confirm = process.env.WOTLWEDU_RESET_CONFIRM || "";

  console.log(
    [
      `Preparing scale reset prefix=${prefix}`,
      `includeSysadmin=${includeSysadmin}`,
      `dryRun=${dryRun}`,
    ].join(" ")
  );

  if (!Config.db_password) {
    throw new Error(
      [
        "WOTLWEDU_DB_PASSWORD is required for scale seed reset.",
        "When using the local Docker stack, either run inside the backend container",
        "or provide the compose DB credentials on the host.",
        "Examples:",
        "  WOTLWEDU_DB_HOST=localhost WOTLWEDU_DB_PASSWORD=wotlwedu WOTLWEDU_RESET_CONFIRM=scale npm run reset:scale-tenants",
        "  WOTLWEDU_RESET_CONFIRM=scale npm run reset:scale-tenants:compose",
      ].join("\n")
    );
  }

  await database.authenticate();
  const counts = await countRows(prefix, includeSysadmin);
  console.log(`Matched rows: ${JSON.stringify(counts)}`);

  if (dryRun) {
    console.log("Dry run only; no rows deleted.");
    return;
  }

  if (confirm !== prefix) {
    throw new Error(
      `Refusing to delete scale seed rows without WOTLWEDU_RESET_CONFIRM=${prefix}`
    );
  }

  await database.transaction(async (transaction) => {
    await destroyRows(
      Session,
      {
        where: {
          [Op.or]: [
            whereLike("userId", `${prefix}_user_%`),
            ...(includeSysadmin ? [{ userId: `${prefix}_sysadmin` }] : []),
          ],
        },
        transaction,
      },
      "sessions"
    );
    await destroyRows(
      WorkgroupMember,
      {
        where: whereLike("id", `${prefix}_spacemember_%`),
        transaction,
      },
      "space memberships"
    );
    await destroyRows(
      UserRole,
      {
        where: {
          [Op.or]: [
            whereLike("userId", `${prefix}_user_%`),
            ...(includeSysadmin ? [{ userId: `${prefix}_sysadmin` }] : []),
          ],
        },
        transaction,
      },
      "user role assignments"
    );
    await destroyRows(
      Workgroup,
      {
        where: whereLike("id", `${prefix}_space_%`),
        transaction,
      },
      "spaces"
    );
    await destroyRows(
      User,
      {
        where: {
          [Op.or]: [
            whereLike("id", `${prefix}_user_%`),
            ...(includeSysadmin ? [{ id: `${prefix}_sysadmin` }] : []),
          ],
        },
        transaction,
      },
      "users"
    );
    await destroyRows(
      Organization,
      {
        where: whereLike("id", `${prefix}_org_%`),
        transaction,
      },
      "organizations"
    );
  });

  console.log("Scale seed reset complete");
}

main()
  .catch((err) => {
    console.error("Scale seed reset failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.close().catch(() => {});
  });

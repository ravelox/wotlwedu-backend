const bcrypt = require("bcryptjs");

const Config = require("../config/wotlwedu");
const database = require("../util/database");
const Associations = require("../model/associations");

const Organization = require("../model/organization");
const Role = require("../model/role");
const User = require("../model/user");
const UserRole = require("../model/userrole");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");

Associations.setup();

function intEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(random, min, max) {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

async function bulkInsert(Model, rows, chunkSize, label, options = {}) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    await Model.bulkCreate(chunk, {
      ignoreDuplicates: true,
      validate: false,
      ...options,
    });
  }
  console.log(`Seeded ${rows.length} ${label}`);
}

async function ensureRole(defaultRoleId, creatorId) {
  const configuredName = Config.defaultRoleName || "Default Role";
  let role = await Role.findOne({ where: { name: configuredName } });
  if (role) return role;

  role = await Role.create({
    id: defaultRoleId,
    name: configuredName,
    description: "Default role",
    protected: false,
    creator: creatorId,
  });
  console.log(`Created default role ${role.id} (${role.name})`);
  return role;
}

async function ensureSysadmin({ prefix, passwordHash }) {
  const sysadminId = `${prefix}_sysadmin`;
  const existing = await User.findByPk(sysadminId);
  if (existing) return existing;

  const created = await User.create({
    id: sysadminId,
    firstName: "Scale",
    lastName: "Sysadmin",
    alias: `${prefix}_sysadmin`,
    email: `${prefix}.sysadmin@example.invalid`,
    auth: passwordHash,
    organizationId: null,
    creator: sysadminId,
    active: true,
    verified: true,
    admin: true,
    systemAdmin: true,
    organizationAdmin: false,
    workgroupAdmin: false,
  });
  console.log(`Created seeded sysadmin ${created.id}`);
  return created;
}

function buildOrganizationBatch({
  prefix,
  firstOrgNumber,
  orgCount,
  minUsersPerOrg,
  minSpacesPerOrg,
  maxSpacesPerOrg,
  random,
  creatorId,
  roleId,
  passwordHash,
}) {
  const organizations = [];
  const workgroups = [];
  const users = [];
  const userRoles = [];
  const workgroupMembers = [];

  for (let offset = 0; offset < orgCount; offset += 1) {
    const orgNumber = firstOrgNumber + offset;
    const orgSuffix = pad(orgNumber, 5);
    const orgId = `${prefix}_org_${orgSuffix}`;
    const spaceCount = randomInt(random, minSpacesPerOrg, maxSpacesPerOrg);
    const usersPerOrg = Math.max(minUsersPerOrg, 2 + spaceCount + 1);
    const spaceIds = [];

    organizations.push({
      id: orgId,
      name: `Scale Seed Organization ${orgSuffix}`,
      description: `Generated organization ${orgSuffix} for support-console scale testing`,
      active: true,
      creator: creatorId,
    });

    for (let spaceIndex = 1; spaceIndex <= spaceCount; spaceIndex += 1) {
      const spaceSuffix = pad(spaceIndex, 3);
      const spaceId = `${prefix}_space_${orgSuffix}_${spaceSuffix}`;
      spaceIds.push(spaceId);
      workgroups.push({
        id: spaceId,
        name: `Seed Space ${orgSuffix}-${spaceSuffix}`,
        description: `Generated space ${spaceSuffix} for organization ${orgSuffix}`,
        organizationId: orgId,
        active: true,
        creator: creatorId,
      });
    }

    for (let userIndex = 1; userIndex <= usersPerOrg; userIndex += 1) {
      const userSuffix = pad(userIndex, 3);
      const userId = `${prefix}_user_${orgSuffix}_${userSuffix}`;
      const isOrgAdmin = userIndex <= 2;
      const spaceAdminIndex = userIndex - 2;
      const adminSpaceId =
        !isOrgAdmin && spaceAdminIndex >= 1 && spaceAdminIndex <= spaceCount
          ? spaceIds[spaceAdminIndex - 1]
          : null;
      const isSpaceAdmin = Boolean(adminSpaceId);
      const assignedSpaceId = adminSpaceId || spaceIds[(userIndex - 1) % spaceIds.length];

      users.push({
        id: userId,
        firstName: isOrgAdmin ? "Org" : isSpaceAdmin ? "Space" : "Seed",
        lastName: isOrgAdmin
          ? `Admin ${orgSuffix}-${userSuffix}`
          : isSpaceAdmin
          ? `Admin ${orgSuffix}-${userSuffix}`
          : `User ${orgSuffix}-${userSuffix}`,
        alias: `${prefix}_${orgSuffix}_${userSuffix}`,
        email: `${prefix}.${orgSuffix}.${userSuffix}@example.invalid`,
        auth: passwordHash,
        organizationId: orgId,
        creator: creatorId,
        active: true,
        verified: true,
        admin: false,
        systemAdmin: false,
        organizationAdmin: isOrgAdmin,
        workgroupAdmin: isSpaceAdmin,
        adminWorkgroupId: adminSpaceId,
      });

      userRoles.push({
        id: `${prefix}_userrole_${orgSuffix}_${userSuffix}`,
        roleId,
        userId,
      });

      if (assignedSpaceId) {
        workgroupMembers.push({
          id: `${prefix}_spacemember_${orgSuffix}_${userSuffix}`,
          workgroupId: assignedSpaceId,
          userId,
          active: true,
          creator: creatorId,
        });
      }
    }
  }

  return { organizations, workgroups, users, userRoles, workgroupMembers };
}

async function main() {
  const prefix = process.env.WOTLWEDU_SEED_PREFIX || "scale";
  const orgCount = intEnv("WOTLWEDU_SEED_ORG_COUNT", 15000, { min: 1 });
  const minUsersPerOrg = intEnv("WOTLWEDU_SEED_MIN_USERS_PER_ORG", 30, { min: 30 });
  const minSpacesPerOrg = intEnv("WOTLWEDU_SEED_MIN_SPACES_PER_ORG", 1, { min: 1 });
  const maxSpacesPerOrg = intEnv("WOTLWEDU_SEED_MAX_SPACES_PER_ORG", 8, {
    min: minSpacesPerOrg,
  });
  const batchOrgCount = intEnv("WOTLWEDU_SEED_BATCH_ORGS", 100, { min: 1 });
  const insertChunkSize = intEnv("WOTLWEDU_SEED_INSERT_CHUNK_SIZE", 1000, { min: 1 });
  const randomSeed = intEnv("WOTLWEDU_SEED_RANDOM_SEED", 8675309, { min: 1 });
  const password = process.env.WOTLWEDU_SEED_PASSWORD || "seed password change me";
  const dryRun = boolEnv("WOTLWEDU_SEED_DRY_RUN", false);
  const random = createRandom(randomSeed);

  console.log(
    [
      `Preparing scale seed prefix=${prefix}`,
      `organizations=${orgCount}`,
      `minUsersPerOrg=${minUsersPerOrg}`,
      `spacesPerOrg=${minSpacesPerOrg}-${maxSpacesPerOrg}`,
      `batchOrgs=${batchOrgCount}`,
      `dryRun=${dryRun}`,
    ].join(" ")
  );

  if (dryRun) {
    const sampleRandom = createRandom(randomSeed);
    let totalSpaces = 0;
    let totalUsers = 0;
    for (let orgNumber = 1; orgNumber <= orgCount; orgNumber += 1) {
      const spaceCount = randomInt(sampleRandom, minSpacesPerOrg, maxSpacesPerOrg);
      totalSpaces += spaceCount;
      totalUsers += Math.max(minUsersPerOrg, 2 + spaceCount + 1);
    }
    console.log(
      `Dry run would create up to ${orgCount} organizations, ${totalSpaces} spaces, ${totalUsers} organization users, plus 1 sysadmin`
    );
    return;
  }

  if (!Config.db_password) {
    throw new Error(
      [
        "WOTLWEDU_DB_PASSWORD is required for real scale seeding.",
        "When using the local Docker stack, either run inside the backend container",
        "or provide the compose DB credentials on the host.",
        "Examples:",
        "  WOTLWEDU_DB_HOST=localhost WOTLWEDU_DB_PASSWORD=wotlwedu WOTLWEDU_SEED_PASSWORD=password npm run seed:scale-tenants",
        "  WOTLWEDU_SEED_PASSWORD=password npm run seed:scale-tenants:compose",
      ].join("\n")
    );
  }

  await database.authenticate();
  const passwordHash = await bcrypt.hash(password, 8);
  const sysadmin = await ensureSysadmin({ prefix, passwordHash });
  const defaultRole = await ensureRole(`${prefix}_role_default`, sysadmin.id);

  for (let firstOrgNumber = 1; firstOrgNumber <= orgCount; firstOrgNumber += batchOrgCount) {
    const currentBatchOrgCount = Math.min(batchOrgCount, orgCount - firstOrgNumber + 1);
    const batch = buildOrganizationBatch({
      prefix,
      firstOrgNumber,
      orgCount: currentBatchOrgCount,
      minUsersPerOrg,
      minSpacesPerOrg,
      maxSpacesPerOrg,
      random,
      creatorId: sysadmin.id,
      roleId: defaultRole.id,
      passwordHash,
    });

    await bulkInsert(Organization, batch.organizations, insertChunkSize, "organizations");
    await bulkInsert(Workgroup, batch.workgroups, insertChunkSize, "spaces");
    await bulkInsert(User, batch.users, insertChunkSize, "users");
    await bulkInsert(UserRole, batch.userRoles, insertChunkSize, "user role assignments");
    await bulkInsert(
      WorkgroupMember,
      batch.workgroupMembers,
      insertChunkSize,
      "space memberships"
    );

    const lastOrgNumber = firstOrgNumber + currentBatchOrgCount - 1;
    console.log(`Completed organizations ${firstOrgNumber}-${lastOrgNumber} of ${orgCount}`);
  }

  console.log("Scale seed complete");
}

main()
  .catch((err) => {
    console.error("Scale seed failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.close().catch(() => {});
  });

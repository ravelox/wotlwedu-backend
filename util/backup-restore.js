const { Op } = require("sequelize");

const database = require("./database");

const AbuseAudit = require("../model/abuseaudit");
const AuthAudit = require("../model/authaudit");
const Capability = require("../model/capability");
const Category = require("../model/category");
const ContactSuppression = require("../model/contactsuppression");
const Election = require("../model/election");
const Friend = require("../model/friend");
const Group = require("../model/group");
const GroupMember = require("../model/groupmember");
const Image = require("../model/image");
const Item = require("../model/item");
const List = require("../model/list");
const ListItem = require("../model/listitem");
const Metadata = require("../model/metadata");
const Notification = require("../model/notification");
const Organization = require("../model/organization");
const OrganizationInvite = require("../model/organizationinvite");
const Preference = require("../model/preference");
const PublicPollInvite = require("../model/publicpollinvite");
const PublicPollParticipant = require("../model/publicpollparticipant");
const PublicPollVote = require("../model/publicpollvote");
const Role = require("../model/role");
const RoleCapability = require("../model/rolecapability");
const SocialIdentity = require("../model/socialidentity");
const Status = require("../model/status");
const TrustProfile = require("../model/trustprofile");
const User = require("../model/user");
const UserRole = require("../model/userrole");
const Vote = require("../model/vote");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");

const BACKUP_FORMAT = "wotlwedu.backup.v1";

const TABLES = [
  { key: "statuses", model: Status },
  { key: "capabilities", model: Capability },
  { key: "roles", model: Role },
  { key: "roleCapabilities", model: RoleCapability },
  { key: "metadata", model: Metadata },
  { key: "organizations", model: Organization },
  { key: "users", model: User },
  { key: "userRoles", model: UserRole },
  { key: "socialIdentities", model: SocialIdentity },
  { key: "trustProfiles", model: TrustProfile },
  { key: "preferences", model: Preference },
  { key: "workgroups", model: Workgroup },
  { key: "workgroupMembers", model: WorkgroupMember },
  { key: "categories", model: Category },
  { key: "groups", model: Group },
  { key: "groupMembers", model: GroupMember },
  { key: "images", model: Image },
  { key: "items", model: Item },
  { key: "lists", model: List },
  { key: "listItems", model: ListItem },
  { key: "elections", model: Election },
  { key: "votes", model: Vote },
  { key: "friends", model: Friend },
  { key: "notifications", model: Notification },
  { key: "organizationInvites", model: OrganizationInvite },
  { key: "authAudits", model: AuthAudit },
  { key: "publicPollParticipants", model: PublicPollParticipant },
  { key: "publicPollVotes", model: PublicPollVote },
  { key: "publicPollInvites", model: PublicPollInvite },
  { key: "abuseAudits", model: AbuseAudit },
  { key: "contactSuppressions", model: ContactSuppression },
];

const REFERENCE_TABLES = new Set([
  "statuses",
  "capabilities",
  "roles",
  "roleCapabilities",
]);

function normalizeScope(scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (["system", "organization", "space"].includes(normalized)) return normalized;
  return null;
}

function rowsToIds(rows) {
  return new Set((rows || []).map((row) => row.id).filter(Boolean));
}

function orByFields(fields, values) {
  const list = [...values].filter(Boolean);
  if (!list.length) return null;
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.in]: list } })) };
}

async function findRows(Model, where) {
  return Model.findAll({
    ...(where ? { where } : {}),
    raw: true,
  });
}

async function buildScopeSets(scope, ids = {}) {
  const organizationIds = new Set();
  const workgroupIds = new Set();

  if (scope === "organization" && ids.organizationId) {
    organizationIds.add(ids.organizationId);
  }
  if (scope === "space" && ids.workgroupId) {
    const workgroup = await Workgroup.findByPk(ids.workgroupId, { raw: true });
    if (!workgroup) {
      const err = new Error("Space not found");
      err.status = 404;
      throw err;
    }
    workgroupIds.add(workgroup.id);
    if (workgroup.organizationId) organizationIds.add(workgroup.organizationId);
  }

  const workgroups = scope === "organization"
    ? await findRows(Workgroup, { organizationId: { [Op.in]: [...organizationIds] } })
    : scope === "space"
      ? await findRows(Workgroup, { id: { [Op.in]: [...workgroupIds] } })
      : [];
  for (const row of workgroups) {
    if (row.id) workgroupIds.add(row.id);
    if (row.organizationId) organizationIds.add(row.organizationId);
  }

  const organizations = organizationIds.size
    ? await findRows(Organization, { id: { [Op.in]: [...organizationIds] } })
    : [];
  if (scope === "organization" && !organizations.length) {
    const err = new Error("Organization not found");
    err.status = 404;
    throw err;
  }

  const users = organizationIds.size
    ? await findRows(User, { organizationId: { [Op.in]: [...organizationIds] } })
    : [];
  const userIds = rowsToIds(users);

  const workgroupMembers = workgroupIds.size
    ? await findRows(WorkgroupMember, { workgroupId: { [Op.in]: [...workgroupIds] } })
    : [];
  for (const row of workgroupMembers) {
    if (row.userId) userIds.add(row.userId);
  }

  const groups = organizationIds.size
    ? await findRows(Group, { organizationId: { [Op.in]: [...organizationIds] } })
    : [];
  const groupIds = rowsToIds(groups);

  const images = workgroupIds.size
    ? await findRows(Image, { workgroupId: { [Op.in]: [...workgroupIds] } })
    : [];
  const items = workgroupIds.size
    ? await findRows(Item, { workgroupId: { [Op.in]: [...workgroupIds] } })
    : [];
  const lists = workgroupIds.size
    ? await findRows(List, { workgroupId: { [Op.in]: [...workgroupIds] } })
    : [];
  const elections = workgroupIds.size
    ? await findRows(Election, { workgroupId: { [Op.in]: [...workgroupIds] } })
    : [];

  const imageIds = rowsToIds(images);
  const itemIds = rowsToIds(items);
  const listIds = rowsToIds(lists);
  const electionIds = rowsToIds(elections);
  for (const election of elections) {
    if (election.groupId) groupIds.add(election.groupId);
    if (election.listId) listIds.add(election.listId);
  }

  const listItems = listIds.size || itemIds.size
    ? await findRows(ListItem, {
        [Op.or]: [
          ...(listIds.size ? [{ listId: { [Op.in]: [...listIds] } }] : []),
          ...(itemIds.size ? [{ itemId: { [Op.in]: [...itemIds] } }] : []),
        ],
      })
    : [];
  for (const row of listItems) {
    if (row.itemId) itemIds.add(row.itemId);
    if (row.listId) listIds.add(row.listId);
  }

  const categories = userIds.size || groupIds.size || workgroupIds.size || imageIds.size || itemIds.size || listIds.size
    ? await findRows(Category, {
        [Op.or]: [
          ...(userIds.size ? [{ creator: { [Op.in]: [...userIds] } }] : []),
          ...(groups.length ? [{ id: { [Op.in]: groups.map((row) => row.categoryId).filter(Boolean) } }] : []),
          ...(workgroups.length ? [{ id: { [Op.in]: workgroups.map((row) => row.categoryId).filter(Boolean) } }] : []),
          ...(images.length ? [{ id: { [Op.in]: images.map((row) => row.categoryId).filter(Boolean) } }] : []),
          ...(items.length ? [{ id: { [Op.in]: items.map((row) => row.categoryId).filter(Boolean) } }] : []),
          ...(lists.length ? [{ id: { [Op.in]: lists.map((row) => row.categoryId).filter(Boolean) } }] : []),
        ],
      })
    : [];
  const categoryIds = rowsToIds(categories);

  return {
    organizationIds,
    workgroupIds,
    userIds,
    groupIds,
    imageIds,
    itemIds,
    listIds,
    electionIds,
    categoryIds,
  };
}

function scopedWhere(tableKey, sets) {
  if (REFERENCE_TABLES.has(tableKey)) return null;
  switch (tableKey) {
    case "metadata":
      return { name: "__none__" };
    case "contactSuppressions":
      return { id: "__none__" };
    case "organizations":
      return { id: { [Op.in]: [...sets.organizationIds] } };
    case "users":
      return { id: { [Op.in]: [...sets.userIds] } };
    case "userRoles":
    case "socialIdentities":
    case "trustProfiles":
      return { userId: { [Op.in]: [...sets.userIds] } };
    case "preferences":
      return { creator: { [Op.in]: [...sets.userIds] } };
    case "workgroups":
      return { id: { [Op.in]: [...sets.workgroupIds] } };
    case "workgroupMembers":
      return { workgroupId: { [Op.in]: [...sets.workgroupIds] } };
    case "categories":
      return { id: { [Op.in]: [...sets.categoryIds] } };
    case "groups":
      return { id: { [Op.in]: [...sets.groupIds] } };
    case "groupMembers":
      return { groupId: { [Op.in]: [...sets.groupIds] } };
    case "images":
      return { id: { [Op.in]: [...sets.imageIds] } };
    case "items":
      return { id: { [Op.in]: [...sets.itemIds] } };
    case "lists":
      return { id: { [Op.in]: [...sets.listIds] } };
    case "listItems":
      return {
        [Op.or]: [
          { listId: { [Op.in]: [...sets.listIds] } },
          { itemId: { [Op.in]: [...sets.itemIds] } },
        ],
      };
    case "elections":
      return { id: { [Op.in]: [...sets.electionIds] } };
    case "votes":
      return {
        [Op.or]: [
          { electionId: { [Op.in]: [...sets.electionIds] } },
          { userId: { [Op.in]: [...sets.userIds] } },
          { itemId: { [Op.in]: [...sets.itemIds] } },
        ],
      };
    case "friends":
      return orByFields(["userId", "friendId"], sets.userIds);
    case "notifications":
      return orByFields(["userId", "senderId"], sets.userIds);
    case "organizationInvites":
    case "authAudits":
      return { organizationId: { [Op.in]: [...sets.organizationIds] } };
    case "publicPollParticipants":
    case "publicPollVotes":
    case "publicPollInvites":
    case "abuseAudits":
      return { electionId: { [Op.in]: [...sets.electionIds] } };
    default:
      return { id: "__none__" };
  }
}

function primaryKeyFor(Model) {
  return Model.primaryKeyAttribute || "id";
}

function cleanRow(Model, row) {
  const fields = Object.keys(Model.rawAttributes || {});
  const cleaned = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      cleaned[field] = row[field];
    }
  }
  return cleaned;
}

async function exportBackup({ scope, organizationId, workgroupId }) {
  const normalizedScope = normalizeScope(scope);
  if (!normalizedScope) {
    const err = new Error("Invalid backup scope");
    err.status = 421;
    throw err;
  }

  const sets =
    normalizedScope === "system"
      ? null
      : await buildScopeSets(normalizedScope, { organizationId, workgroupId });

  const data = {};
  const counts = {};

  for (const table of TABLES) {
    const where = normalizedScope === "system" ? null : scopedWhere(table.key, sets);
    const rows = await findRows(table.model, where);
    data[table.key] = rows.map((row) => cleanRow(table.model, row));
    counts[table.key] = data[table.key].length;
  }

  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    scope: normalizedScope,
    organizationId: normalizedScope === "organization" ? organizationId : sets?.organizationIds?.values().next().value || null,
    workgroupId: normalizedScope === "space" ? workgroupId : null,
    counts,
    data,
  };
}

async function restoreBackup(backup, options = {}) {
  if (!backup || backup.format !== BACKUP_FORMAT || !backup.data) {
    const err = new Error("Unsupported backup format");
    err.status = 421;
    throw err;
  }

  const mode = options.mode === "insertOnly" ? "insertOnly" : "upsert";
  const summary = {};

  await database.transaction(async (transaction) => {
    for (const table of TABLES) {
      const rows = Array.isArray(backup.data[table.key]) ? backup.data[table.key] : [];
      const pk = primaryKeyFor(table.model);
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const cleaned = cleanRow(table.model, row);
        if (!cleaned[pk]) {
          skipped += 1;
          continue;
        }

        const existing = await table.model.findByPk(cleaned[pk], { transaction });
        if (existing) {
          if (mode === "insertOnly") {
            skipped += 1;
            continue;
          }
          await existing.update(cleaned, { transaction });
          updated += 1;
        } else {
          await table.model.create(cleaned, { transaction });
          created += 1;
        }
      }

      summary[table.key] = { created, updated, skipped };
    }
  });

  return {
    restoredAt: new Date().toISOString(),
    mode,
    summary,
  };
}

module.exports = {
  BACKUP_FORMAT,
  exportBackup,
  normalizeScope,
  restoreBackup,
};

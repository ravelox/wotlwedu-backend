const { Op } = require("sequelize");

const database = require("./database");

const Category = require("../model/category");
const Group = require("../model/group");
const GroupMember = require("../model/groupmember");
const Image = require("../model/image");
const Item = require("../model/item");
const List = require("../model/list");
const ListItem = require("../model/listitem");
const Election = require("../model/election");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");
const PublicPollInvite = require("../model/publicpollinvite");

const DIRECT_RESOURCE_MODELS = {
  categories: Category,
  groups: Group,
  images: Image,
  items: Item,
  lists: List,
  elections: Election,
  workgroups: Workgroup,
};

function normalizeResourceList(resources) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return Object.keys(DIRECT_RESOURCE_MODELS);
  }

  const normalized = resources
    .map((entry) => (entry || "").toString().trim().toLowerCase())
    .filter((entry) => Object.prototype.hasOwnProperty.call(DIRECT_RESOURCE_MODELS, entry));

  return normalized.length ? [...new Set(normalized)] : Object.keys(DIRECT_RESOURCE_MODELS);
}

async function getOwnedIds(Model, ownerId, transaction = null) {
  const rows = await Model.findAll({
    where: { creator: ownerId },
    attributes: ["id"],
    raw: true,
    ...(transaction ? { transaction } : {}),
  });
  return (rows || []).map((row) => row.id).filter(Boolean);
}

async function buildTransferPlan(sourceOwnerId, selectedResources, includeLinked, transaction = null) {
  const resources = normalizeResourceList(selectedResources);
  const direct = {};
  const linked = {};
  const ids = {};

  for (const resource of resources) {
    const Model = DIRECT_RESOURCE_MODELS[resource];
    ids[resource] = await getOwnedIds(Model, sourceOwnerId, transaction);
    direct[resource] = ids[resource].length;
  }

  if (!includeLinked) {
    return { direct, linked, ids };
  }

  linked.groupMemberships = ids.groups?.length
    ? await GroupMember.count({
        where: { groupId: { [Op.in]: ids.groups } },
        ...(transaction ? { transaction } : {}),
      })
    : 0;

  linked.workgroupMemberships = ids.workgroups?.length
    ? await WorkgroupMember.count({
        where: { workgroupId: { [Op.in]: ids.workgroups } },
        ...(transaction ? { transaction } : {}),
      })
    : 0;

  linked.listEntries = ids.lists?.length
    ? await ListItem.count({
        where: { listId: { [Op.in]: ids.lists } },
        ...(transaction ? { transaction } : {}),
      })
    : 0;

  linked.publicPollInvites = ids.elections?.length
    ? await PublicPollInvite.count({
        where: { electionId: { [Op.in]: ids.elections } },
        ...(transaction ? { transaction } : {}),
      })
    : 0;

  const linkedItemRefs = ids.lists?.length
    ? await ListItem.findAll({
        where: { listId: { [Op.in]: ids.lists } },
        attributes: ["itemId"],
        raw: true,
        ...(transaction ? { transaction } : {}),
      })
    : [];
  const linkedItemIds = [...new Set((linkedItemRefs || []).map((row) => row.itemId).filter(Boolean))];
  ids.linkedItems = linkedItemIds.length
    ? await getOwnedIds(Item, sourceOwnerId, transaction).then((ownedIds) =>
        ownedIds.filter((id) => linkedItemIds.includes(id))
      )
    : [];
  linked.linkedItems = ids.linkedItems.length;

  const candidateImageIds = new Set();
  if (ids.items?.length) {
    const ownedItems = await Item.findAll({
      where: { id: { [Op.in]: ids.items } },
      attributes: ["imageId"],
      raw: true,
      ...(transaction ? { transaction } : {}),
    });
    for (const row of ownedItems || []) {
      if (row.imageId) candidateImageIds.add(row.imageId);
    }
  }
  if (ids.linkedItems?.length) {
    const linkedItems = await Item.findAll({
      where: { id: { [Op.in]: ids.linkedItems } },
      attributes: ["imageId"],
      raw: true,
      ...(transaction ? { transaction } : {}),
    });
    for (const row of linkedItems || []) {
      if (row.imageId) candidateImageIds.add(row.imageId);
    }
  }
  ids.linkedImages = candidateImageIds.size
    ? await getOwnedIds(
        Image,
        sourceOwnerId,
        transaction
      ).then((ownedImageIds) => ownedImageIds.filter((id) => candidateImageIds.has(id)))
    : [];
  linked.linkedImages = ids.linkedImages.length;

  return { direct, linked, ids };
}

async function executeTransfer(sourceOwnerId, targetOwnerId, selectedResources, includeLinked) {
  return database.transaction(async (transaction) => {
    const plan = await buildTransferPlan(
      sourceOwnerId,
      selectedResources,
      includeLinked,
      transaction
    );

    const resources = normalizeResourceList(selectedResources);
    const changed = {};

    for (const resource of resources) {
      const Model = DIRECT_RESOURCE_MODELS[resource];
      const count = await Model.update(
        { creator: targetOwnerId },
        {
          where: { creator: sourceOwnerId },
          transaction,
        }
      );
      changed[resource] = Array.isArray(count) ? count[0] : count;
    }

    if (includeLinked) {
      changed.groupMemberships = plan.ids.groups?.length
        ? await GroupMember.update(
            { creator: targetOwnerId },
            {
              where: { groupId: { [Op.in]: plan.ids.groups } },
              transaction,
            }
          ).then((result) => (Array.isArray(result) ? result[0] : result))
        : 0;

      changed.workgroupMemberships = plan.ids.workgroups?.length
        ? await WorkgroupMember.update(
            { creator: targetOwnerId },
            {
              where: { workgroupId: { [Op.in]: plan.ids.workgroups } },
              transaction,
            }
          ).then((result) => (Array.isArray(result) ? result[0] : result))
        : 0;

      changed.listEntries = plan.ids.lists?.length
        ? await ListItem.update(
            { creator: targetOwnerId },
            {
              where: { listId: { [Op.in]: plan.ids.lists } },
              transaction,
            }
          ).then((result) => (Array.isArray(result) ? result[0] : result))
        : 0;

      changed.publicPollInvites = plan.ids.elections?.length
        ? await PublicPollInvite.update(
            { creator: targetOwnerId, creatorUserId: targetOwnerId },
            {
              where: { electionId: { [Op.in]: plan.ids.elections } },
              transaction,
            }
          ).then((result) => (Array.isArray(result) ? result[0] : result))
        : 0;

      changed.linkedItems = plan.ids.linkedItems?.length
        ? await Item.update(
            { creator: targetOwnerId },
            {
              where: { id: { [Op.in]: plan.ids.linkedItems } },
              transaction,
            }
          ).then((result) => (Array.isArray(result) ? result[0] : result))
        : 0;

      changed.linkedImages = plan.ids.linkedImages?.length
        ? await Image.update(
            { creator: targetOwnerId },
            {
              where: { id: { [Op.in]: plan.ids.linkedImages } },
              transaction,
            }
          ).then((result) => (Array.isArray(result) ? result[0] : result))
        : 0;
    }

    return {
      resources,
      includeLinked,
      direct: plan.direct,
      linked: plan.linked,
      changed,
    };
  });
}

module.exports = {
  normalizeResourceList,
  buildTransferPlan,
  executeTransfer,
};

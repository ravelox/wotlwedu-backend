const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize")

const Helper = require("./helper");
const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Notify = require("../util/notification");
const { copyObject, getStatusIdByName } = require("../util/helpers");

const Item = require("../model/item");
const Image = require("../model/image");
const Category = require("../model/category");
const Friend = require("../model/friend");
const Notification = require("../model/notification");
const Workgroup = require("../model/workgroup");

const Attributes = require("../model/attributes")

function generateIncludes(details) {
  const includes = [];
  if (details) {
    const splitDetail = details.split(",");

    if (splitDetail.includes("image")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
        "url",
      ]);
      includes.push({ model: Image, attributes: modImageAttributes });
    }
    if (splitDetail.includes("category")) {
      includes.push({ model: Category, attributes: Attributes.Category });
    }
  }
  return includes;
}
module.exports.getItem = async (req, res, next) => {
  const itemToFind = req.params.itemId;
  const notificationToFind = req.params.notificationId;
  const options = {};
  const whereCondition = {};
  let bypassSecurityCheck = false;

  if (!itemToFind) return StatusResponse(res, 421, "No item ID provided");

  whereCondition.id = itemToFind;

  if (notificationToFind) {
    const notification = await Helper.getNotification(notificationToFind);
    if (notification) {
      if (
        notification.userId === req.authUserId &&
        notification.objectId === itemToFind
      ) {
        bypassSecurityCheck = true;
      }
    }
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.attributes = Attributes.Item;
  options.include = includes;

  Item.findOne(options)
    .then(async (foundItem) => {
      if (!foundItem) return StatusResponse(res, 404, "Item not found");

      if (!bypassSecurityCheck) {
        if (foundItem.workgroupId) {
          const allowed = await Security.canAccessWorkgroup(req, foundItem.workgroupId);
          if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
        } else if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
          if (foundItem.creator !== req.authUserId) {
            return StatusResponse(res, 403, "Not authorized for this item");
          }
        }
      }

      return StatusResponse(res, 200, "OK", { item: foundItem });
    })
    .catch((err) => next(err));
};

module.exports.getAllItem = async (req, res, next) => {
  let userFilter = req.query.filter;
  const workgroupId = req.query.workgroupId || null;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};

  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;

  // Sort order
  options.order = [["name"]];

  let whereCondition = {};

  if (userFilter) {
    whereCondition = {
      [Op.or]: [{ name: { [Op.like]: "%" + userFilter + "%" } }],
    };
  }

  if (workgroupId) {
    const foundWorkgroup = await Workgroup.findByPk(workgroupId, { raw: true });
    if (!foundWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
    const allowed = await Security.canAccessWorkgroup(req, foundWorkgroup);
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    whereCondition.workgroupId = workgroupId;
  } else if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    // Legacy mode: items without workgroupId are creator-owned.
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Item;
  options.distinct = true;

  Item.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        items: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      items: rows,
    });
  });
};

module.exports.postUpdateItem = async (req, res, next) => {
  const itemToFind = req.params.itemId;
  if (!itemToFind) return StatusResponse(res, 421, "No item ID provided");

  Item.findByPk(itemToFind)
    .then(async (foundItem) => {
      if (!foundItem) return StatusResponse(res, 404, "Item not found");

      if (foundItem.workgroupId) {
        const allowed = await Security.canAccessWorkgroup(req, foundItem.workgroupId);
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
      } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
        if (foundItem.creator !== req.authUserId) {
          return StatusResponse(res, 403, "Not authorized for this item");
        }
      }

      if (req.body.name) foundItem.name = req.body.name;
      if (req.body.description) foundItem.description = req.body.description;
      if (req.body.imageId || req.body.imageId === null)
        foundItem.imageId = req.body.imageId;
      if (req.body.url) foundItem.url = req.body.url;
      if (req.body.location) foundItem.location = req.body.location;
      if (req.body.categoryId) foundItem.categoryId = req.body.categoryId;

      if (req.body.workgroupId || req.body.workgroupId === null) {
        if (req.body.workgroupId === null) {
          // Only system admins can remove workgroup scoping.
          if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
            return StatusResponse(res, 403, "Not authorized to clear workgroupId");
          }
          foundItem.workgroupId = null;
        } else {
          const targetWorkgroup = await Workgroup.findByPk(req.body.workgroupId, { raw: true });
          if (!targetWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
          const allowed = await Security.canAccessWorkgroup(req, targetWorkgroup);
          if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
          foundItem.workgroupId = targetWorkgroup.id;
        }
      }

      foundItem
        .save()
        .then((updatedItem) => {
          if (!updatedItem)
            return StatusResponse(res, 500, "Unable to update item");

          return StatusResponse(res, 200, "OK", {
            item: copyObject(updatedItem, Attributes.Item),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddItem = async (req, res, next) => {
  if (!req.body.name) return StatusResponse(res, 421, "No item name provided");

  if (!req.body.description)
    return StatusResponse(res, 421, "No description provided");

  if (!req.body.image && !req.body.url && !req.body.location)
    return StatusResponse(res, 421, "Must have either image,url or location");

  // Populate the item properties
  const itemToAdd = new Item();
  itemToAdd.id = UUID("item");
  itemToAdd.creator = req.authUserId;
  itemToAdd.name = req.body.name;
  itemToAdd.description = req.body.description;
  if (req.body.imageId) itemToAdd.imageId = req.body.imageId;
  if (req.body.url) itemToAdd.url = req.body.url;
  if (req.body.location) itemToAdd.location = req.body.location;
  if (req.body.categoryId) itemToAdd.categoryId = req.body.categoryId;

  if (req.body.workgroupId) {
    const targetWorkgroup = await Workgroup.findByPk(req.body.workgroupId, { raw: true });
    if (!targetWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
    const allowed = await Security.canAccessWorkgroup(req, targetWorkgroup);
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    itemToAdd.workgroupId = targetWorkgroup.id;
  }

  // Check that this user hasn't already added an item with the same name
  Item.findOne({
    where: itemToAdd.workgroupId
      ? { name: itemToAdd.name, workgroupId: itemToAdd.workgroupId }
      : { name: itemToAdd.name, creator: req.authUserId },
  })
    .then((foundItem) => {
      if (foundItem) return StatusResponse(res, 421, "Item exists");

      // Save the item to the database
      itemToAdd
        .save()
        .then((addedItem) => {
          if (!addedItem) return StatusResponse(res, 500, "Cannot add item");

          return StatusResponse(res, 200, "OK", {
            item: copyObject(addedItem, Attributes.Item),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteItem = (req, res, next) => {
  const itemToFind = req.params.itemId;
  if (!itemToFind) return StatusResponse(res, 421, "No item ID provided");

  Item.findByPk(itemToFind)
    .then(async (foundItem) => {
      if (!foundItem) return StatusResponse(res, 404, "Item not found");

      if (foundItem.workgroupId) {
        const allowed = await Security.canAccessWorkgroup(req, foundItem.workgroupId);
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
      } else if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
        if (foundItem.creator !== req.authUserId) {
          return StatusResponse(res, 403, "Not authorized for this item");
        }
      }

      foundItem
        .destroy()
        .then((removedItem) => {
          if (!removedItem)
            return StatusResponse(res, 500, "Cannot delete item");

          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

// This is a 2 stage process:
// 1. Sender posts a notification to share
// 2. Recipient must be a friend (not pending) at the time (check is made in code) to accept
module.exports.getShareItem = async (req, res, next) => {
  const itemToShare = req.params.itemId;
  const recipientId = req.params.recipient;

  if (!itemToShare || !recipientId)
    return StatusResponse(res, 421, "Must have item ID and recipient Id");

  const friendStatus = await getStatusIdByName("Friend");

  const friendWhere = {
    userId: req.authUserId,
    friendId: recipientId,
    statusId: friendStatus,
  };

  Friend.findOne({ where: friendWhere }).then(async (foundFriendship) => {
    if (!foundFriendship) return StatusResponse(res, 421, "Not friends");

    const itemShareNotification = await getStatusIdByName("Share Item");

    await Notify.sendNotification(
      req.authUserId,
      recipientId,
      itemShareNotification,
      itemToShare,
      req.authName + " wants to share an item"
    );
    return StatusResponse(res, 200, "OK");
  });
};

module.exports.getAcceptItem = (req, res, next) => {
  const notificationId = req.params.notificationId;

  if (!notificationId)
    return StatusResponse(res, 421, "No notification Id provided");

  Notification.findByPk(notificationId).then(async (foundNotification) => {
    if (!foundNotification)
      return StatusResponse(res, 404, "Notification not found");

    if (foundNotification.userId !== req.authUserId)
      return StatusResponse(
        res,
        421,
        "Notification is not for the current user"
      );

    const itemShareNotification = await getStatusIdByName("Share Item");
    if (foundNotification.type !== itemShareNotification)
      return StatusResponse(res, 421, "Notification is not an item share");

    const itemToShare = foundNotification.objectId;

    Helper.copyItem(itemToShare, req.authUserId)
      .then((copiedItem) => {
        if (!copiedItem) return StatusResponse(res, 500, "Unable to copy item");

        foundNotification.destroy().then(() => {
          return StatusResponse(res, 200, "OK");
        });
      })
      .catch((err) => next(err));
  });
};

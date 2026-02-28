const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize")

const Helper = require("./helper");
const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const toBool = require("../util/tobool");
const CategoryScope = require("../util/categoryscope");
const Notify = require("../util/notification");
const { copyObject, getStatusIdByName, buildCategoryMenu } = require("../util/helpers");

const Item = require("../model/item");
const Image = require("../model/image");
const Category = require("../model/category");
const Friend = require("../model/friend");
const Notification = require("../model/notification");
const Workgroup = require("../model/workgroup");
const database = require("../util/database");

const Attributes = require("../model/attributes")

function generateIncludes(details, req) {
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
      includes.push({
        model: Category,
        attributes: Attributes.Category,
        where: { creator: req.authUserId },
        required: false,
      });
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

  const includes = generateIncludes(req.query.detail, req);

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
  const rawWorkgroupId = req.query.workgroupId;
  const workgroupId =
    rawWorkgroupId &&
    rawWorkgroupId !== "undefined" &&
    rawWorkgroupId !== "null"
      ? rawWorkgroupId
      : null;
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

  const includes = generateIncludes(req.query.detail, req);

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

    const payload = {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      items: rows,
    };
    if (toBool(req.query.collapsible)) {
      payload.menu = buildCategoryMenu(rows, "items");
    }
    return StatusResponse(res, 200, "OK", payload);
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
      const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
        req,
        req.body.categoryId
      );
      if (!categoryResolution.ok) {
        return StatusResponse(
          res,
          categoryResolution.status,
          categoryResolution.message
        );
      }
      if (categoryResolution.hasValue) {
        foundItem.categoryId = categoryResolution.value;
      }

      const rawWorkgroupId = req.body.workgroupId;
      const hasWorkgroupIdField =
        rawWorkgroupId !== undefined &&
        rawWorkgroupId !== "undefined";
      const requestedWorkgroupId =
        rawWorkgroupId === "null" ? null : rawWorkgroupId;

      if (hasWorkgroupIdField) {
        if (requestedWorkgroupId === null) {
          // Only system admins can remove workgroup scoping.
          if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
            return StatusResponse(res, 403, "Not authorized to clear workgroupId");
          }
          foundItem.workgroupId = null;
        } else if (requestedWorkgroupId) {
          const targetWorkgroup = await Workgroup.findByPk(requestedWorkgroupId, { raw: true });
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
  const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
    req,
    req.body.categoryId
  );
  if (!categoryResolution.ok) {
    return StatusResponse(
      res,
      categoryResolution.status,
      categoryResolution.message
    );
  }
  if (categoryResolution.hasValue) {
    itemToAdd.categoryId = categoryResolution.value;
  }

  const rawWorkgroupId = req.body.workgroupId;
  const requestWorkgroupId =
    rawWorkgroupId &&
    rawWorkgroupId !== "undefined" &&
    rawWorkgroupId !== "null"
      ? rawWorkgroupId
      : null;

  if (requestWorkgroupId) {
    const targetWorkgroup = await Workgroup.findByPk(requestWorkgroupId, { raw: true });
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

  database
    .transaction(async (transaction) => {
      const foundNotification = await Notification.findByPk(notificationId, {
        transaction: transaction,
        lock: transaction.LOCK.UPDATE,
      });

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

      const friendStatus = await getStatusIdByName("Friend");
      const activeFriendship = await Friend.findOne({
        where: {
          userId: foundNotification.senderId,
          friendId: req.authUserId,
          statusId: friendStatus,
        },
        transaction: transaction,
      });

      if (!activeFriendship)
        return StatusResponse(res, 421, "Share is no longer valid");

      const itemToShare = foundNotification.objectId;
      const copiedItem = await Helper.copyItem(itemToShare, req.authUserId, {
        transaction: transaction,
      });

      if (!copiedItem)
        return StatusResponse(res, 500, "Unable to copy item");

      await foundNotification.destroy({ transaction: transaction });
      return { ok: true, userId: req.authUserId, notificationId: notificationId };
    })
    .then(async (result) => {
      if (!result || result.ok !== true) return result;

      await Notify.emitNotificationEvent(result.userId, "deleted", {
        notificationId: result.notificationId,
        notification: null,
      });
      return StatusResponse(res, 200, "OK");
    })
    .catch((err) => next(err));
};

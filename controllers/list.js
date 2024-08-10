const Util = require("util");
const { Op } = require("sequelize");

const Helper = require("./helper");
const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName } = require("../util/helpers");
const Notify = require("../util/notification");

const List = require("../model/list");
const ListItem = require('../model/listitem')
const Item = require("../model/item");
const Image = require("../model/image");
const Category = require("../model/category");
const Election = require("../model/election");
const Friend = require("../model/friend");
const Notification = require("../model/notification");

const Attributes = require("../model/attributes")

function generateIncludes(details) {
  let includes = [];
  if (details) {
    const splitDetails = details.split(",");
    if (splitDetails.includes("category")) {
      includes.push({ model: Category, attributes: Attributes.Category });
    }

    if (splitDetails.includes("item")) {
      const imageIncludes = [];

      if (splitDetails.includes("image")) {
        imageIncludes.push({ model: Image, attributes: Attributes.Image });
      }

      includes.push({
        model: Item,
        attributes: Attributes.Item,
        include: imageIncludes,
        through: { model: ListItem, attributes: [] },
      });
    }
  }
  return includes;
}
module.exports.getSingleList = async (req, res, next) => {
  const listToFind = req.params.listId;
  const notificationToFind = req.params.notificationId;
  let bypassSecurityCheck = false;

  const options = {};
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");

  const whereCondition = {};
  whereCondition.id = listToFind;

  if (notificationToFind) {
    const notification = await Helper.getNotification(notificationToFind);
    if (notification) {
      if (
        notification.userId === req.authUserId &&
        notification.objectId === listToFind
      ) {
        bypassSecurityCheck = true;
      }
    }
  }

  if (! bypassSecurityCheck ) {
    if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
      whereCondition.creator = req.authUserId;
    }
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.List;

  List.findOne(options)
    .then((foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      return StatusResponse(res, 200, "OK", {
        list: foundList,
      });
    })
    .catch((err) => next(err));
};

module.exports.getAllList = (req, res, next) => {
  let userFilter = req.query.filter;
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

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.List;
  options.distinct = true;

  List.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        lists: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      lists: rows,
    });
  });
};

module.exports.postUpdateList = (req, res, next) => {
  const listToFind = req.params.listId;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");

  const whereCondition = { id: listToFind };

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  List.findOne({ where: whereCondition })
    .then((foundList) => {
      if (!foundList)
        return StatusResponse(res, 404, "postUpdate: List not found");

      if (req.body.name) foundList.name = req.body.name;
      if (req.body.description) foundList.description = req.body.description;
      if (req.body.categoryId) foundList.categoryId = req.body.categoryId;

      foundList
        .save()
        .then((updatedList) => {
          if (!updatedList)
            return StatusResponse(res, 500, "Cannot update list");

          return StatusResponse(res, 200, "OK", {
            list: copyObject(updatedList, listAttributes),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddList = (req, res, next) => {
  // Check to see if this user has already created a list with this name
  List.findOne({ where: { creator: req.authUserId, name: req.body.name } })
    .then((foundList) => {
      if (foundList) return StatusResponse(res, 421, "List exists");

      // Populate the List properties
      const ListToAdd = new List();
      ListToAdd.name = req.body.name;
      ListToAdd.description = req.body.description;
      ListToAdd.id = UUID("list");
      ListToAdd.creator = req.authUserId;
      if (req.body.categoryId) ListToAdd.categoryId = req.body.categoryId;

      // Save the List to the database
      ListToAdd.save()
        .then((addedList) => {
          if (!addedList) return StatusResponse(res, 500, "Cannot add list");

          return StatusResponse(res, 200, "OK", {
            list: copyObject(addedList, listAttributes),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteList = (req, res, next) => {
  const listToFind = req.params.listId;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");

  let whereCondition = { id: listToFind };

  if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  List.findOne({ where: whereCondition })
    .then((foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      // Check to see if the list is being used in an election
      Election.findOne({ where: { listId: foundList.id } })
        .then((foundElection) => {
          if (foundElection) return StatusResponse(res, 421, "List in use");

          foundList
            .destroy()
            .then((deletedList) => {
              if (!deletedList)
                return StatusResponse(res, 500, "Cannot delete list");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putItemOnList = (req, res, next) => {
  const listToFind = req.params.listId;
  const itemToFind = req.params.itemId;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");
  if (!itemToFind) return StatusResponse(res, 421, "No item ID provided");

  let whereCondition = { id: listToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  List.findOne({ where: whereCondition })
    .then((foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      // Only items that are created by the current user or everything if the user is admin
      Item.findByPk(itemToFind)
        .then((foundItem) => {
          if (!foundItem) return StatusResponse(res, 404, "Item not found");

          foundList
            .addItem(foundItem, {
              through: { id: UUID("listitem"), creator: req.authUserId },
            })
            .then((addedItem) => {
              if (!addedItem)
                return StatusResponse(res, 500, "Cannot add item to list");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteItemFromList = (req, res, next) => {
  const listToFind = req.params.listId;
  const itemToFind = req.params.itemId;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");
  if (!itemToFind) return StatusResponse(res, 421, "No item ID provided");
  let whereCondition = { id: listToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  List.findOne({ where: whereCondition })
    .then((foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      Item.findByPk(itemToFind)
        .then((foundItem) => {
          if (!foundItem) return StatusResponse(res, 404, "Item not found");

          foundList
            .removeItem(foundItem)
            .then((removedItem) => {
              if (!removedItem)
                return StatusResponse(res, 500, "Cannot delete item from list");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

// Bulk-add functions
module.exports.putBulkAddItemToList = (req, res, next) => {
  const listToFind = req.params.listId;
  const itemList = req.body.itemList;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");
  if (!itemList) return StatusResponse(res, 421, "No item list provided");

  let whereCondition = { id: listToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  List.findOne({ where: whereCondition }).then(async (foundList) => {
    if (!foundList) return StatusResponse(res, 404, "List not found");

    // Work through the list of items
    const results = [];
    for (itemToFind of itemList) {
      await Item.findByPk(itemToFind)
        .then(async (itemFound) => {
          if (!itemFound) {
            results.push({
              id: itemToFind,
              status: 404,
              message: "Item not found",
            });
          } else {
            const throughOption = {
              through: {
                id: UUID("listitem"),
                creator: req.authUserId,
              },
            };
            await foundList
              .addItem(itemFound, throughOption)
              .then((addedItem) => {
                if (!addedItem) {
                  results.push({
                    id: itemToFind,
                    status: 500,
                    message: "Cannot add to list",
                  });
                } else {
                  results.push({
                    id: itemToFind,
                    status: 200,
                    message: "OK",
                  });
                }
              })
              .catch((err) => next(err));
          }
        })
        .catch((err) => next(err));
    }
    return StatusResponse(res, 200, "OK", { results: results });
  });
};

module.exports.deleteBulkItemFromList = (req, res, next) => {
  const listToFind = req.params.listId;
  const itemList = req.body.itemList;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");
  if (!itemList) return StatusResponse(res, 421, "No item list provided");

  let whereCondition = { id: listToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  List.findOne({ where: whereCondition })
    .then(async (foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      const results = [];
      for (itemToFind of itemList) {
        await Item.findByPk(itemToFind)
          .then(async (itemFound) => {
            if (!itemFound) {
              results.push({
                id: itemToFind,
                status: 404,
                message: "Item not found",
              });
            } else {
              await foundList
                .removeItem(itemFound)
                .then((removedItem) => {
                  if (!removedItem) {
                    results.push({
                      id: itemToFind,
                      status: 500,
                      message: "Cannot delete item from role",
                    });
                  } else {
                    results.push({
                      id: itemToFind,
                      status: 200,
                      message: "OK",
                    });
                  }
                })
                .catch((err) => next(err));
            }
          })
          .catch((err) => next(err));
        return StatusResponse(res, 200, "OK", { results: results });
      }
    })
    .catch((err) => next(err));
};

// This is a 2 stage process:
// 1. Sender posts a notification to share
// 2. Recipient must be a friend (not pending) at the time (check is made in code) to accept
module.exports.getShareList = async (req, res, next) => {
  const listToShare = req.params.listId;
  const recipientId = req.params.recipient;

  if (!listToShare || !recipientId)
    return StatusResponse(res, 421, "Must have list ID and recipient Id");

  const friendStatus = await getStatusIdByName("Friend");

  const friendWhere = {
    userId: req.authUserId,
    friendId: recipientId,
    statusId: friendStatus,
  };

  Friend.findOne({ where: friendWhere }).then(async (foundFriendship) => {
    if (!foundFriendship) return StatusResponse(res, 421, "Not friends");

    const listShareNotification = await getStatusIdByName("Share List");
    await Notify.sendNotification(
      req.authUserId,
      recipientId,
      listShareNotification,
      listToShare,
      req.authName + " wants to share a list"
    );
    return StatusResponse(res, 200, "OK");
  });
};

module.exports.getAcceptList = (req, res, next) => {
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

    const listShareNotification = await getStatusIdByName("Share List");
    if (foundNotification.type !== listShareNotification)
      return StatusResponse(res, 421, "Notification is not a list share");

    const listToShare = foundNotification.objectId;

    Helper.copyList(listToShare, req.authUserId)
      .then((copiedList) => {
        if (!copiedList) return StatusResponse(res, 500, "Unable to copy list");

        foundNotification.destroy().then(() => {
          return StatusResponse(res, 200, "OK");
        });
      })
      .catch((err) => next(err));
  });
};

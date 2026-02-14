const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize");

const Helper = require("./helper");
const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName } = require("../util/helpers");
const Notify = require("../util/notification");

const List = require("../model/list");
const ListItem = require("../model/listitem");
const Item = require("../model/item");
const Image = require("../model/image");
const Category = require("../model/category");
const Election = require("../model/election");
const Friend = require("../model/friend");
const Notification = require("../model/notification");
const Workgroup = require("../model/workgroup");

const Attributes = require("../model/attributes");

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
        const modImageAttributes = Attributes.Image.slice();
        modImageAttributes.push([
          Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
          "url",
        ]);
        imageIncludes.push({ model: Image, attributes: modImageAttributes });
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

async function assertCanAccessList(req, list, op) {
  if (!req || !list) return false;
  if (list.workgroupId) {
    return await Security.canAccessWorkgroup(req, list.workgroupId);
  }
  return Security.getVerdict(req.verdicts, op).isAdmin || list.creator === req.authUserId;
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

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.List;

  List.findOne(options)
    .then(async (foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      if (!bypassSecurityCheck) {
        const allowed = await assertCanAccessList(req, foundList, "view");
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");
      }

      return StatusResponse(res, 200, "OK", {
        list: foundList,
      });
    })
    .catch((err) => next(err));
};

module.exports.getAllList = async (req, res, next) => {
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
    // Legacy creator-owned lists
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

  List.findByPk(listToFind)
    .then(async (foundList) => {
      if (!foundList)
        return StatusResponse(res, 404, "postUpdate: List not found");

      const allowed = await assertCanAccessList(req, foundList, "edit");
      if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");

      if (req.body.name) foundList.name = req.body.name;
      if (req.body.description) foundList.description = req.body.description;
      if (req.body.categoryId || req.body.categoryId === null) foundList.categoryId = req.body.categoryId;

      if (req.body.workgroupId || req.body.workgroupId === null) {
        if (req.body.workgroupId === null) {
          if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
            return StatusResponse(res, 403, "Not authorized to clear workgroupId");
          }
          foundList.workgroupId = null;
        } else {
          const targetWorkgroup = await Workgroup.findByPk(req.body.workgroupId, { raw: true });
          if (!targetWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
          const wgAllowed = await Security.canAccessWorkgroup(req, targetWorkgroup);
          if (!wgAllowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
          foundList.workgroupId = targetWorkgroup.id;
        }
      }

      foundList
        .save()
        .then((updatedList) => {
          if (!updatedList)
            return StatusResponse(res, 500, "Cannot update list");

          return StatusResponse(res, 200, "OK", {
            list: copyObject(updatedList, Attributes.List),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddList = async (req, res, next) => {
  const name = req.body.name;
  if (!name) return StatusResponse(res, 421, "No list name provided");

  let workgroupId = req.body.workgroupId || null;
  if (workgroupId) {
    const targetWorkgroup = await Workgroup.findByPk(workgroupId, { raw: true });
    if (!targetWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
    const allowed = await Security.canAccessWorkgroup(req, targetWorkgroup);
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    workgroupId = targetWorkgroup.id;
  }

  // Check to see if this user has already created a list with this name (scoped by workgroup if present)
  List.findOne({ where: workgroupId ? { workgroupId, name } : { creator: req.authUserId, name } })
    .then((foundList) => {
      if (foundList) return StatusResponse(res, 421, "List exists");

      // Populate the List properties
      const ListToAdd = new List();
      ListToAdd.name = name;
      ListToAdd.description = req.body.description;
      ListToAdd.id = UUID("list");
      ListToAdd.creator = req.authUserId;
      if (req.body.categoryId) ListToAdd.categoryId = req.body.categoryId;
      if (workgroupId) ListToAdd.workgroupId = workgroupId;

      // Save the List to the database
      ListToAdd.save()
        .then((addedList) => {
          if (!addedList) return StatusResponse(res, 500, "Cannot add list");

          return StatusResponse(res, 200, "OK", {
            list: copyObject(addedList, Attributes.List),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteList = (req, res, next) => {
  const listToFind = req.params.listId;
  if (!listToFind) return StatusResponse(res, 421, "No list ID provided");

  List.findByPk(listToFind)
    .then(async (foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      const allowed = await assertCanAccessList(req, foundList, "delete");
      if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");

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

  List.findByPk(listToFind)
    .then(async (foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      const allowed = await assertCanAccessList(req, foundList, "edit");
      if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");

      Item.findByPk(itemToFind)
        .then(async (foundItem) => {
          if (!foundItem) return StatusResponse(res, 404, "Item not found");

          // Enforce workgroup consistency when list is workgroup-scoped.
          if (foundList.workgroupId) {
            if (foundItem.workgroupId !== foundList.workgroupId) {
              return StatusResponse(res, 403, "Item is not in this workgroup");
            }
          } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
            if (foundItem.creator !== req.authUserId) {
              return StatusResponse(res, 403, "Not authorized for this item");
            }
          }

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
  List.findByPk(listToFind)
    .then(async (foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      const allowed = await assertCanAccessList(req, foundList, "edit");
      if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");

      Item.findByPk(itemToFind)
        .then(async (foundItem) => {
          if (!foundItem) return StatusResponse(res, 404, "Item not found");

          if (foundList.workgroupId) {
            if (foundItem.workgroupId !== foundList.workgroupId) {
              return StatusResponse(res, 403, "Item is not in this workgroup");
            }
          } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
            if (foundItem.creator !== req.authUserId) {
              return StatusResponse(res, 403, "Not authorized for this item");
            }
          }

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

  List.findByPk(listToFind).then(async (foundList) => {
    if (!foundList) return StatusResponse(res, 404, "List not found");

    const allowed = await assertCanAccessList(req, foundList, "edit");
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");

    // Work through the list of items
    const results = [];
    for (const itemToFind of itemList) {
      await Item.findByPk(itemToFind)
        .then(async (itemFound) => {
          if (!itemFound) {
            results.push({
              id: itemToFind,
              status: 404,
              message: "Item not found",
            });
          } else {
            if (foundList.workgroupId) {
              if (itemFound.workgroupId !== foundList.workgroupId) {
                results.push({
                  id: itemToFind,
                  status: 403,
                  message: "Item is not in this workgroup",
                });
                return;
              }
            } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
              if (itemFound.creator !== req.authUserId) {
                results.push({
                  id: itemToFind,
                  status: 403,
                  message: "Not authorized for this item",
                });
                return;
              }
            }

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

  List.findByPk(listToFind)
    .then(async (foundList) => {
      if (!foundList) return StatusResponse(res, 404, "List not found");

      const results = [];
      const allowed = await assertCanAccessList(req, foundList, "edit");
      if (!allowed) return StatusResponse(res, 403, "Not authorized for this list");

      for (const itemToFind of itemList) {
        await Item.findByPk(itemToFind)
          .then(async (itemFound) => {
            if (!itemFound) {
              results.push({
                id: itemToFind,
                status: 404,
                message: "Item not found",
              });
            } else {
              if (foundList.workgroupId) {
                if (itemFound.workgroupId !== foundList.workgroupId) {
                  results.push({
                    id: itemToFind,
                    status: 403,
                    message: "Item is not in this workgroup",
                  });
                  return;
                }
              } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
                if (itemFound.creator !== req.authUserId) {
                  results.push({
                    id: itemToFind,
                    status: 403,
                    message: "Not authorized for this item",
                  });
                  return;
                }
              }

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
      }
      return StatusResponse(res, 200, "OK", { results: results });
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

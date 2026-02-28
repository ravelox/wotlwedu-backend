const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName } = require("../util/helpers");

const Config = require("../config/wotlwedu");
const Notify = require("../util/notification");

const Notification = require("../model/notification");
const User = require("../model/user");
const Status = require("../model/status");

const Attributes = require("../model/attributes");

function buildIncludes() {
  const includes = [];

  if (Notification.associations.user) {
    includes.push({ model: User, attributes: Attributes.NotificationUser, as: "user" });
  }
  if (Notification.associations.sender) {
    includes.push({ model: User, attributes: Attributes.NotificationSender, as: "sender" });
  }
  if (Notification.associations.status) {
    includes.push({ model: Status, attributes: Attributes.Status });
  }

  return includes;
}

function buildNotificationSummary(notification) {
  return copyObject(notification, Attributes.Notification);
}

module.exports.getSingleNotification = async (req, res, next) => {
  try {
    const notificationToFind = req.params.notificationId;
    if (!notificationToFind)
      return StatusResponse(res, 421, "No notification ID provided");

    const whereCondition = { id: notificationToFind };
    if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
      whereCondition.userId = req.authUserId;
    }

    const foundNotification = await Notification.findOne({
      where: whereCondition,
      attributes: Attributes.Notification,
      include: buildIncludes(),
    });

    if (!foundNotification)
      return StatusResponse(res, 404, "Notification not found");

    return StatusResponse(res, 200, "OK", { notification: foundNotification });
  } catch (err) {
    return next(err);
  }
};

module.exports.getAllNotification = async (req, res, next) => {
  try {
    let page = +req.query.page;
    let itemsPerPage = +req.query.items;

    if (!page || page < 1) page = 1;
    if (!itemsPerPage || itemsPerPage < 1)
      itemsPerPage = +Config.defaultItemsPerPage;

    const whereCondition = { userId: req.authUserId };
    if (req.query.statusId) whereCondition.statusId = +req.query.statusId;
    if (req.query.type) whereCondition.type = +req.query.type;

    const count = await Notification.count({
      where: whereCondition,
    });

    const rows = await Notification.findAll({
      where: whereCondition,
      attributes: Attributes.Notification,
      include: buildIncludes(),
      order: [["createdAt", "DESC"]],
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage,
    });

    return StatusResponse(res, 200, "OK", {
      notifications: rows || [],
      page: page,
      total: count || 0,
      itemsPerPage: itemsPerPage,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.getUnreadNotificationCount = async (req, res, next) => {
  try {
    const unreadStatus = await getStatusIdByName("Unread");
    const unread = await Notification.count({
      where: {
        userId: req.authUserId,
        statusId: unreadStatus,
      },
    });

    return StatusResponse(res, 200, "OK", { unread: unread || 0 });
  } catch (err) {
    return next(err);
  }
};

module.exports.postUpdateNotification = async (req, res, next) => {
  try {
    const notificationToFind = req.params.notificationId;
    if (!notificationToFind)
      return StatusResponse(res, 421, "No notification ID provided");

    const whereCondition = { id: notificationToFind };
    if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
      whereCondition.userId = req.authUserId;
    }

    const foundNotification = await Notification.findOne({ where: whereCondition });
    if (!foundNotification)
      return StatusResponse(res, 404, "Notification not found");

    if (req.body.userId) foundNotification.userId = req.body.userId;
    if (req.body.senderId) foundNotification.senderId = req.body.senderId;
    if (req.body.statusId) foundNotification.statusId = req.body.statusId;
    if (req.body.type) foundNotification.type = req.body.type;
    if (req.body.text) foundNotification.text = req.body.text;
    if (req.body.objectId !== undefined) foundNotification.objectId = req.body.objectId;

    const updatedNotification = await foundNotification.save();
    if (!updatedNotification)
      return StatusResponse(res, 500, "Unable to update notification");

    await Notify.emitNotificationEvent(updatedNotification.userId, "updated", {
      notificationId: updatedNotification.id,
    });

    return StatusResponse(res, 200, "OK", {
      notification: buildNotificationSummary(updatedNotification),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.putAddNotification = async (req, res, next) => {
  try {
    const addUserId = req.body.userId;
    const addSenderId = req.body.senderId;
    const addStatus = req.body.statusId;
    const addType = req.body.type;
    const addText = req.body.text;
    const addObjectId = req.body.objectId;

    if (!addUserId || !addSenderId || !addStatus || !addType || !addText)
      return StatusResponse(res, 421, "Must provide all details");

    const notificationToAdd = new Notification();
    notificationToAdd.userId = addUserId;
    notificationToAdd.senderId = addSenderId;
    notificationToAdd.id = UUID("notif");
    notificationToAdd.statusId = addStatus;
    notificationToAdd.type = addType;
    notificationToAdd.text = addText;
    notificationToAdd.objectId = addObjectId || null;
    notificationToAdd.creator = req.authUserId;

    const addedNotification = await notificationToAdd.save();
    if (!addedNotification)
      return StatusResponse(res, 500, "Cannot add notification");

    await Notify.emitNotificationEvent(addedNotification.userId, "created", {
      notificationId: addedNotification.id,
    });

    return StatusResponse(res, 200, "OK", {
      notification: buildNotificationSummary(addedNotification),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.deleteNotification = async (req, res, next) => {
  try {
    const notificationToFind = req.params.notificationId;
    if (!notificationToFind)
      return StatusResponse(res, 421, "No notification ID provided");

    const whereCondition = { id: notificationToFind };
    if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
      whereCondition.userId = req.authUserId;
    }

    const foundNotification = await Notification.findOne({ where: whereCondition });
    if (!foundNotification)
      return StatusResponse(res, 404, "Notification not found");

    const deletedUserId = foundNotification.userId;
    const deletedNotificationId = foundNotification.id;
    await foundNotification.destroy();
    await Notify.emitNotificationEvent(deletedUserId, "deleted", {
      notificationId: deletedNotificationId,
      notification: null,
    });
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    return next(err);
  }
};

module.exports.putSetStatus = async (req, res, next) => {
  try {
    const notificationToFind = req.params.notificationId;
    const statusId = req.params.statusId;

    if (!notificationToFind || !statusId)
      return StatusResponse(res, 421, "Need a notification Id and a status Id");

    const whereCondition = { id: notificationToFind };
    if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
      whereCondition.userId = req.authUserId;
    }

    const foundNotif = await Notification.findOne({ where: whereCondition });
    if (!foundNotif)
      return StatusResponse(res, 404, "Notification not found");

    foundNotif.statusId = statusId;
    const updatedNotif = await foundNotif.save();
    if (!updatedNotif)
      return StatusResponse(res, 500, "Cannot update notification status");

    await Notify.emitNotificationEvent(updatedNotif.userId, "updated", {
      notificationId: updatedNotif.id,
    });

    return StatusResponse(res, 200, "OK", {
      notification: buildNotificationSummary(updatedNotif),
    });
  } catch (err) {
    return next(err);
  }
};

const Util = require("util");

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject } = require("../util/helpers");
const Sequelize = require("sequelize");

const Notification = require("../model/notification");
const User = require("../model/user");
const Status = require("../model/status");
const { stat } = require("fs");

const notificationAttributes = ["id", "type", "text", "objectId"];
const userAttributes = [
  "id",
  "firstName",
  "lastName",
  [
    Sequelize.fn(
      "CONCAT",
      Sequelize.col("user.firstName"),
      " ",
      Sequelize.col("user.lastName")
    ),
    "fullName",
  ],
];
const senderAttributes = [
  "id",
  "firstName",
  "lastName",
  [
    Sequelize.fn(
      "CONCAT",
      Sequelize.col("sender.firstName"),
      " ",
      Sequelize.col("sender.lastName")
    ),
    "fullName",
  ],
];
const statusAttributes = ["id", "name"];

module.exports.getSingleNotification = (req, res, next) => {
  const notificationToFind = req.params.notificationId;
  if (!notificationToFind)
    return StatusResponse(res, 421, "No notification ID provided");

  const options = {};
  const whereCondition = {};

  whereCondition.id = notificationToFind;
  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.userId = req.authUserId;
  }
  
  const includes = [];
  includes.push({ model: User, attributes: userAttributes });
  includes.push({ model: User, attributes: senderAttributes, as: "sender" });
  includes.push({
    model: Status,
    attributes: statusAttributes,
  });

  options.where = whereCondition;
  options.attributes = notificationAttributes;
  options.include = includes;

  Notification.findOne(options)
    .then((foundNotification) => {
      if (!foundNotification)
        return StatusResponse(res, 404, "Notification not found");

      return StatusResponse(res, 200, "OK", { notification: foundNotification });
    })
    .catch((err) => next(err));
};

module.exports.getAllNotification = (req, res, next) => {
  const options = {};
  const whereCondition = {};

  whereCondition.userId = req.authUserId;

  const includes = [];
  includes.push({ model: User, attributes: userAttributes });
  includes.push({ model: User, attributes: senderAttributes, as: "sender" });
  includes.push({ model: Status, attributes: statusAttributes });

  options.where = whereCondition;
  options.attributes = notificationAttributes;
  options.include = includes;
  options.distinct = true;

  Notification.findAll(options).then((foundNotifications) => {
    if (!foundNotifications) {
      return StatusResponse(res, 200, "OK", {
        notifications: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      notifications: foundNotifications,
    });
  });
};

module.exports.postUpdateNotification = (req, res, next) => {
  const notificationToFind = req.params.notificationId;
  if (!notificationToFind)
    return StatusResponse(res, 421, "No notification ID provided");

  let whereCondition = {};

  whereCondition.id = notificationToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }
  Notification.findOne({ where: whereCondition })
    .then((foundNotification) => {
      if (!foundNotification)
        return StatusResponse(res, 404, "Notification not found");

      if (req.body.userId) foundNotification.userId = req.body.userId;
      if (req.body.senderId) foundNotification.senderId = req.body.senderId;
      if (req.body.statusId) foundNotification.statusId = req.body.statusId;
      if (req.body.type) foundNotification.type = req.body.type;
      if (req.body.text) foundNotification.text = req.body.text;

      foundNotification
        .save()
        .then((updatedNotification) => {
          if (!updatedNotification)
            return StatusResponse(res, 500, "Unable to update notification");
          return StatusResponse(res, 200, "OK", {
            category: copyObject(updatedNotification, notificationAttributes),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddNotification = (req, res, next) => {
  const addUserId = req.body.userId;
  const addSenderId = req.body.senderId;
  const addStatus = req.body.statusId;
  const addType = req.body.type;
  const addText = req.body.text;

  if (!addUserId || !addSenderId || !addStatus || !addType || !addText)
    return StatusResponse(res, 421, "Must provide all details");

  // Populate the Category properties
  const notificationToAdd = new Notification();
  notificationToAdd.userId = addUserId;
  notificationToAdd.senderId = addSenderId;
  notificationToAdd.id = UUID("notif");
  notificationToAdd.statusId = addStatus;
  notificationToAdd.type = addType;
  notificationToAdd.text = addText;
  notificationToAdd.creator = req.authUserId;

  // Save the Category to the database
  notificationToAdd
    .save()
    .then((addedNotification) => {
      if (!addedNotification)
        return StatusResponse(res, 500, "Cannot add Notification");

      return StatusResponse(res, 200, "OK", {
        category: copyObject(addedNotification, notificationAttributes),
      });
    })
    .catch((err) => next(err));
};

module.exports.deleteNotification = (req, res, next) => {
  const notificationToFind = req.params.notificationId;
  if (!notificationToFind)
    return StatusResponse(res, 421, "No notification ID provided");

  let whereCondition = { id: notificationToFind };

  if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Notification.findOne({ where: whereCondition })
    .then((foundNotification) => {
      if (!foundNotification)
        return StatusResponse(res, 404, "Notification not found");

      foundNotification
        .destroy()
        .then((deletedNotification) => {
          if (!deletedNotification)
            return StatusResponse(res, 500, "Cannot delete notification");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putSetStatus = (req, res, next) => {
  const notificationToFind = req.params.notificationId;
  const statusId = req.params.statusId;
  const options = {};

  if (!notificationToFind || !statusId)
    return StatusResponse(res, 421, "Need a notification Id and a status Id");

  let whereCondition = {};

  whereCondition.id = notificationToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  options.where = whereCondition;

  Notification.findOne(options).then((foundNotif) => {
    if (!foundNotif) return StatusResponse(res, 404, "Notification not found");

    foundNotif.statusId = statusId;

    foundNotif.save().then((updatedNotif) => {
      if (!updatedNotif)
        return StatusResponse(res, 500, "Cannot update notification status");
      return StatusResponse(res, 200, "OK", {
        id: foundNotif.id,
        options: options,
      });
    });
  });
};

const Util = require("util");

const UUID = require("./mini-uuid");
const Config = require("../config/wotlwedu");
const Mailer = require("./mailer");
const {getStatusIdByName} = require("./helpers");

const Notification = require("../model/notification");

module.exports.sendNotification = async (
  notifSender,
  notifRcpt,
  notifType,
  notifObjectId,
  notifText
) => {
  if (!notifSender || !notifRcpt || !notifType || !notifText) return;

  const notification = new Notification();
  notification.id = UUID("notif");
  notification.senderId = notifSender;
  notification.userId = notifRcpt;
  notification.type = notifType;
  notification.objectId = notifObjectId;
  notification.text = notifText;

  const foundStatus = await getStatusIdByName("Unread");
  notification.statusId = foundStatus;

  await notification.save();
};

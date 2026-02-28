const UUID = require("./mini-uuid");
const { getStatusIdByName } = require("./helpers");
const IO = require("./wotlwedu-socketio");

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

async function getUnreadCount(userId) {
  const unreadStatus = await getStatusIdByName("Unread");
  return Notification.count({
    where: {
      userId: userId,
      statusId: unreadStatus,
    },
  });
}

async function getNotificationPayload(notificationId) {
  if (!notificationId) return null;

  const notification = await Notification.findByPk(notificationId, {
    attributes: Attributes.Notification,
    include: buildIncludes(),
  });

  return notification && typeof notification.get === "function"
    ? notification.get({ plain: true })
    : notification;
}

async function emitNotificationEvent(userId, kind, options = {}) {
  if (!userId || !kind) return;

  const unreadCount =
    options.unreadCount !== undefined ? options.unreadCount : await getUnreadCount(userId);
  const notification =
    options.notification !== undefined
      ? options.notification
      : await getNotificationPayload(options.notificationId);

  await IO.notifyUser(userId, "notification", {
    kind: kind,
    notificationId: options.notificationId || notification?.id || null,
    unreadCount: unreadCount,
    notification: notification || null,
  });
}

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
  await emitNotificationEvent(notifRcpt, "created", {
    notificationId: notification.id,
  });
};

module.exports.getUnreadCount = getUnreadCount;
module.exports.getNotificationPayload = getNotificationPayload;
module.exports.emitNotificationEvent = emitNotificationEvent;

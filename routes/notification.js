const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const notificationController = require("../controllers/notification");

router.put(
  "/status/:notificationId/:statusId",
  Security.checkCapability("notification", ["edit"]),
  notificationController.putSetStatus
);

router.put(
  "/",
  Security.checkCapability("notification", ["add"]),
  notificationController.putAddNotification
);

router.get(
  "/:notificationId",
  Security.checkCapability("notification", ["view"]),
  notificationController.getSingleNotification
);
router.get(
  "/",
  Security.checkCapability("notification", ["view"]),
  notificationController.getAllNotification
);

router.post(
  "/:notificationId",
  Security.checkCapability("notification", ["edit"]),
  notificationController.postUpdateNotification
);

router.delete(
  "/:notificationId",
  Security.checkCapability("notification", ["delete"]),
  notificationController.deleteNotification
);

module.exports = router;

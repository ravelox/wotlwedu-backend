const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const itemController = require("../controllers/item");

router.get("/share/:itemId/recipient/:recipient", Security.checkCapability("item",["view"]), itemController.getShareItem);
router.get("/accept/:notificationId", Security.checkCapability("item",["view"]), itemController.getAcceptItem);
router.get("/:itemId/notif/:notificationId", itemController.getItem);

// Get/Edit item
router.get(
  "/:itemId",
  Security.checkCapability("item", ["view"]),
  itemController.getItem
);
router.get(
  "/",
  Security.checkCapability("item", ["view"]),
  itemController.getAllItem
);

router.post(
  "/:itemId",
  Security.checkCapability("item", ["edit"]),
  itemController.postUpdateItem
);

router.put(
  "/",
  Security.checkCapability("item", ["add"]),
  itemController.putAddItem
);

router.delete(
  "/:itemId",
  Security.checkCapability("item", ["delete"]),
  itemController.deleteItem
);

module.exports = router;

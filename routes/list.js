const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const listController = require("../controllers/list");

// Add List


router.get("/share/:listId/recipient/:recipient", Security.checkCapability("list",["view"]), listController.getShareList);
router.get("/accept/:notificationId", Security.checkCapability("list",["view"]), listController.getAcceptList);

// First endpoint allows verification via a notification ID
router.get("/:listId/notif/:notificationId", listController.getSingleList);
router.get("/:listId", Security.checkCapability("list",["view"]), listController.getSingleList);
router.get("/", Security.checkCapability("list",["view"]), listController.getAllList);

// Edit a List
router.post("/:listId", Security.checkCapability("list",["edit"]), listController.postUpdateList);


router.put("/", Security.checkCapability("list",["add"]), listController.putAddList);
router.put("/:listId/bulkitemadd", Security.checkCapability("list",["edit"]),listController.putBulkAddItemToList);
router.put("/:listId/bulkitemdel", Security.checkCapability("list",["edit"]),listController.deleteBulkItemFromList);
router.put("/:listId/item/:itemId", Security.checkCapability("list",["edit"]), listController.putItemOnList);

router.delete("/:listId", Security.checkCapability("list",["delete"]), listController.deleteList);
router.delete("/:listId/item/:itemId", Security.checkCapability("list",["edit"]), listController.deleteItemFromList);

module.exports = router;

const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const listController = require("../controllers/list");

// Add List


router.post("/share/:listId/recipient/:recipient", Security.checkCapability("list",["view"]), listController.getShareList);
router.post("/accept/:notificationId", Security.checkCapability("list",["view"]), listController.getAcceptList);

// First endpoint allows verification via a notification ID
router.get("/:listId/notif/:notificationId", listController.getSingleList);
router.get("/:listId", Security.checkCapability("list",["view"]), listController.getSingleList);
router.get("/", Security.checkCapability("list",["view"]), listController.getAllList);

// Edit a List
router.put("/:listId", Security.checkCapability("list",["edit"]), listController.postUpdateList);


router.post("/", Security.checkCapability("list",["add"]), listController.putAddList);
router.post("/:listId/bulkitemadd", Security.checkCapability("list",["edit"]),listController.putBulkAddItemToList);
router.post("/:listId/bulkitemdel", Security.checkCapability("list",["edit"]),listController.deleteBulkItemFromList);
router.put("/:listId/item/:itemId", Security.checkCapability("list",["edit"]), listController.putItemOnList);

router.delete("/:listId", Security.checkCapability("list",["delete"]), listController.deleteList);
router.delete("/:listId/item/:itemId", Security.checkCapability("list",["edit"]), listController.deleteItemFromList);

module.exports = router;

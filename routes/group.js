const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const groupController = require("../controllers/group");

// Add Group
router.put("/", Security.checkCapability("group", ["add"]),groupController.putAddGroup);

// View single Group or all Groups
router.get("/:groupId", Security.checkCapability("group", ["view"]),groupController.getSingleGroup);
router.get("/", Security.checkCapability("group", ["view"]),groupController.getAllGroup);

// Edit a Group
router.post("/:groupId", Security.checkCapability("group", ["edit"]),groupController.postUpdateGroup);

// Manage Users on the Group
router.put("/:groupId/user/:userId", Security.checkCapability("group", ["edit"]),groupController.putUserInGroup);
router.delete("/:groupId/user/:userId",Security.checkCapability("group", ["edit"]), groupController.deleteUserFromGroup);

// Bulk add/delete
router.put("/:groupId/bulkuseradd", Security.checkCapability("group",["edit"]), groupController.putBulkAddUserToRole);
router.put("/:groupId/bulkuserdel", Security.checkCapability("group",["edit"]), groupController.deleteBulkUserFromGroup);

// Delete a Group
router.delete("/:groupId", Security.checkCapability("group", ["delete"]),groupController.deleteGroup);

module.exports = router;

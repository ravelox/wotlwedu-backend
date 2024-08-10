const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const roleController = require("../controllers/role");

// Add role
router.put("/", Security.checkCapability("role",["add"]),roleController.putAddRole);

// View single role or all roles
router.get("/:roleId", Security.checkCapability("role",["view"]),roleController.getSingleRole);
router.get("/", Security.checkCapability("role",["view"]),roleController.getAllRole);

// Edit a role
router.post("/:roleId", Security.checkCapability("role",["edit"]),roleController.postUpdateRole);

// Delete a role
router.delete("/:roleId", Security.checkCapability("role", ["delete"]), roleController.deleteRole);

// Manage capabilities on the role
router.put("/:roleId/bulkcapadd", Security.checkCapability("role",["edit"]), roleController.putBulkAddCapToRole);
router.put("/:roleId/bulkcapdel", Security.checkCapability("role",["edit"]), roleController.deleteBulkCapFromRole);

router.put("/:roleId/cap/:capabilityId", Security.checkCapability("role",["edit"]),roleController.putAddCapToRole);
router.delete("/:roleId/cap/:capabilityId", Security.checkCapability("role",["edit"]),roleController.deleteCapFromRole);

// Manage users given the role
router.put("/:roleId/bulkuseradd", Security.checkCapability("role",["edit"]),roleController.putBulkAddUserToRole);
router.put("/:roleId/bulkuserdel", Security.checkCapability("role",["edit"]),roleController.deleteBulkUserFromRole);

router.put("/:roleId/user/:userId", Security.checkCapability("role",["edit"]),roleController.putAddUserToRole);
router.delete("/:roleId/user/:userId", Security.checkCapability("role",["edit"]),roleController.deleteUserFromRole);

module.exports = router;

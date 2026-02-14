const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const workgroupController = require("../controllers/workgroup");

// Add Workgroup
router.post(
  "/",
  Security.checkCapability("workgroup", ["add"]),
  workgroupController.putAddWorkgroup
);

// View single Workgroup or all Workgroups
router.get(
  "/:workgroupId",
  Security.checkCapability("workgroup", ["view"]),
  workgroupController.getSingleWorkgroup
);
router.get(
  "/",
  Security.checkCapability("workgroup", ["view"]),
  workgroupController.getAllWorkgroup
);

// Edit a Workgroup
router.put(
  "/:workgroupId",
  Security.checkCapability("workgroup", ["edit"]),
  workgroupController.postUpdateWorkgroup
);

// Manage Users on the Workgroup
router.put(
  "/:workgroupId/user/:userId",
  Security.checkCapability("workgroup", ["edit"]),
  workgroupController.putUserInWorkgroup
);
router.delete(
  "/:workgroupId/user/:userId",
  Security.checkCapability("workgroup", ["edit"]),
  workgroupController.deleteUserFromWorkgroup
);

// Bulk add/delete
router.put(
  "/:workgroupId/bulkuseradd",
  Security.checkCapability("workgroup", ["edit"]),
  workgroupController.putBulkAddUserToWorkgroup
);
router.put(
  "/:workgroupId/bulkuserdel",
  Security.checkCapability("workgroup", ["edit"]),
  workgroupController.deleteBulkUserFromWorkgroup
);

// Delete a Workgroup
router.delete(
  "/:workgroupId",
  Security.checkCapability("workgroup", ["delete"]),
  workgroupController.deleteWorkgroup
);

module.exports = router;

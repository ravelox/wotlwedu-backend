const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const capabilityController = require("../controllers/capability");

// Get/Edit capability
router.get(
  "/:capId",
  Security.checkCapability("capability", ["view"]),
  capabilityController.getCapability
);
router.get(
  "/",
  Security.checkCapability("capability", ["view"]),
  capabilityController.getAllCapability
);
router.put(
  "/:capId",
  Security.checkCapability("capability", ["edit"]),
  capabilityController.postUpdateCapability
);
router.post(
  "/",
  Security.checkCapability("capability", ["add"]),
  capabilityController.putAddCapability
);
router.delete(
  "/:capId",
  Security.checkCapability("capability", ["delete"]),
  capabilityController.deleteCapability
);

module.exports = router;

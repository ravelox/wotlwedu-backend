const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const organizationController = require("../controllers/organization");

router.get(
  "/:organizationId",
  Security.checkCapability("organization", ["view"]),
  organizationController.getOrganization
);
router.get(
  "/",
  Security.checkCapability("organization", ["view"]),
  organizationController.getAllOrganization
);
router.post(
  "/",
  Security.checkCapability("organization", ["add"]),
  organizationController.putAddOrganization
);
router.put(
  "/:organizationId",
  Security.checkCapability("organization", ["edit"]),
  organizationController.postUpdateOrganization
);
router.delete(
  "/:organizationId",
  Security.checkCapability("organization", ["delete"]),
  organizationController.deleteOrganization
);

module.exports = router;

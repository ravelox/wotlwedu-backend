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
router.get(
  "/:organizationId/invite",
  Security.checkCapability("organization", ["view"]),
  organizationController.getOrganizationInvites
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
router.post(
  "/:organizationId/invite",
  Security.checkCapability("organization", ["edit"]),
  organizationController.putInviteToOrganization
);
router.post(
  "/:organizationId/invite/:inviteId/resend",
  Security.checkCapability("organization", ["edit"]),
  organizationController.postResendOrganizationInvite
);
router.delete(
  "/:organizationId/invite/:inviteId",
  Security.checkCapability("organization", ["edit"]),
  organizationController.deleteOrganizationInvite
);
router.delete(
  "/:organizationId",
  Security.checkCapability("organization", ["delete"]),
  organizationController.deleteOrganization
);

module.exports = router;

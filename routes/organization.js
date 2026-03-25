const express = require("express");
const Security = require("../util/security");
const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");

const router = express.Router();

const organizationController = require("../controllers/organization");
const inviteManageRateLimit = createRateLimiter({
  max: Config.authRateLimitInviteManageMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many invite management attempts",
});

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
  inviteManageRateLimit,
  Security.checkCapability("organization", ["edit"]),
  organizationController.putInviteToOrganization
);
router.post(
  "/:organizationId/invite/:inviteId/resend",
  inviteManageRateLimit,
  Security.checkCapability("organization", ["edit"]),
  organizationController.postResendOrganizationInvite
);
router.delete(
  "/:organizationId/invite/:inviteId",
  inviteManageRateLimit,
  Security.checkCapability("organization", ["edit"]),
  organizationController.deleteOrganizationInvite
);
router.delete(
  "/:organizationId",
  Security.checkCapability("organization", ["delete"]),
  organizationController.deleteOrganization
);

module.exports = router;

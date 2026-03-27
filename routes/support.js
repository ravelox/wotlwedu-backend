const express = require("express");
const Security = require("../util/security");
const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");

const supportController = require("../controllers/support");
const userController = require("../controllers/user");
const organizationController = require("../controllers/organization");
const loginController = require("../controllers/login");
const publicElectionController = require("../controllers/publicelection");

const router = express.Router();
const inviteManageRateLimit = createRateLimiter({
  max: Config.authRateLimitInviteManageMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many invite management attempts",
});
const publicInviteRateLimit = createRateLimiter({
  max: Config.authRateLimitInviteManageMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many public invite management attempts",
});

router.get("/auth/overview", supportController.getAuthAuditOverview);
router.get("/auth/audit", supportController.getAuthAuditFeed);
router.post(
  "/session/testtoken",
  Security.checkCapability("user", ["view"]),
  loginController.postGenerateTestBearer
);
router.post(
  "/session/testtoken/revoke",
  Security.checkCapability("user", ["view"]),
  loginController.postRevokeTestBearer
);

router.get(
  "/users/:userId/signin-method",
  Security.checkCapability("user", ["view"]),
  userController.getUserSignInMethods
);
router.delete(
  "/users/:userId/signin-method/:identityId",
  Security.checkCapability("user", ["edit"]),
  userController.deleteUserSignInMethod
);
router.get(
  "/users/:userId/authaudit",
  Security.checkCapability("user", ["view"]),
  userController.getUserAuthAudit
);
router.get(
  "/users/:userId/ownership/preview",
  Security.checkCapability("user", ["edit"]),
  userController.getOwnershipTransferPreview
);
router.post(
  "/users/:userId/ownership/transfer",
  Security.checkCapability("user", ["edit"]),
  userController.postOwnershipTransfer
);

router.get(
  "/organizations/:organizationId/invite",
  Security.checkCapability("organization", ["view"]),
  organizationController.getOrganizationInvites
);
router.get(
  "/organizations/:organizationId/authaudit",
  Security.checkCapability("organization", ["view"]),
  organizationController.getOrganizationAuthAudits
);
router.post(
  "/organizations/:organizationId/invite",
  inviteManageRateLimit,
  Security.checkCapability("organization", ["edit"]),
  organizationController.putInviteToOrganization
);
router.post(
  "/organizations/:organizationId/invite/:inviteId/resend",
  inviteManageRateLimit,
  Security.checkCapability("organization", ["edit"]),
  organizationController.postResendOrganizationInvite
);
router.delete(
  "/organizations/:organizationId/invite/:inviteId",
  inviteManageRateLimit,
  Security.checkCapability("organization", ["edit"]),
  organizationController.deleteOrganizationInvite
);

router.get(
  "/elections/public/trust",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicPollTrustProfile
);
router.get(
  "/elections/:electionId/public/stats",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicElectionStats
);
router.get(
  "/elections/:electionId/invite",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicElectionInvites
);
router.post(
  "/elections/:electionId/public/enable",
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postEnablePublicElection
);
router.post(
  "/elections/:electionId/public/disable",
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postDisablePublicElection
);
router.post(
  "/elections/:electionId/invite",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postPublicElectionInvite
);
router.post(
  "/elections/:electionId/invite/:inviteId/resend",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postResendPublicElectionInvite
);
router.delete(
  "/elections/:electionId/invite/:inviteId",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.deletePublicElectionInvite
);

router.get("/publicpoll/overview", supportController.getPublicPollAbuseOverview);
router.get("/publicpoll/audit", supportController.getPublicPollAbuseFeed);

module.exports = router;

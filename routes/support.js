const express = require("express");
const Security = require("../util/security");
const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");

const supportController = require("../controllers/support");
const tutorialController = require("../controllers/tutorial");
const userController = require("../controllers/user");
const organizationController = require("../controllers/organization");
const loginController = require("../controllers/login");
const publicElectionController = require("../controllers/publicelection");

const router = express.Router();
const inviteManageRateLimit = createRateLimiter({
  scope: "support.organization-invite-manage",
  max: Config.authRateLimitInviteManageMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many invite management attempts",
});
const publicInviteRateLimit = createRateLimiter({
  scope: "support.public-invite-manage",
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
  "/people/:userId/signin-method",
  Security.checkCapability("user", ["view"]),
  userController.getUserSignInMethods
);
router.delete(
  "/people/:userId/signin-method/:identityId",
  Security.checkCapability("user", ["edit"]),
  userController.deleteUserSignInMethod
);
router.get(
  "/people/:userId/authaudit",
  Security.checkCapability("user", ["view"]),
  userController.getUserAuthAudit
);
router.get(
  "/people/:userId/session",
  Security.checkCapability("user", ["view"]),
  loginController.getUserSessions
);
router.delete(
  "/people/:userId/session/:sessionId",
  Security.checkCapability("user", ["edit"]),
  loginController.deleteUserSession
);
router.post(
  "/people/:userId/session/revoke-all",
  Security.checkCapability("user", ["edit"]),
  loginController.postRevokeUserSessions
);
router.get(
  "/people/:userId/ownership/preview",
  Security.checkCapability("user", ["edit"]),
  userController.getOwnershipTransferPreview
);
router.post(
  "/people/:userId/ownership/transfer",
  Security.checkCapability("user", ["edit"]),
  userController.postOwnershipTransfer
);
router.post(
  "/people/:userId/tutorial/poll/enable",
  Security.checkCapability("user", ["edit"]),
  tutorialController.postEnablePollTutorialForUser
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
  "/polls/public/trust",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicPollTrustProfile
);
router.get(
  "/polls/:electionId/public/stats",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicElectionStats
);
router.get(
  "/polls/:electionId/invite",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicElectionInvites
);
router.post(
  "/polls/:electionId/public/enable",
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postEnablePublicElection
);
router.post(
  "/polls/:electionId/public/disable",
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postDisablePublicElection
);
router.post(
  "/polls/:electionId/invite",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postPublicElectionInvite
);
router.post(
  "/polls/:electionId/invite/:inviteId/resend",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postResendPublicElectionInvite
);
router.delete(
  "/polls/:electionId/invite/:inviteId",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.deletePublicElectionInvite
);

router.get("/publicpoll/overview", supportController.getPublicPollAbuseOverview);
router.get("/publicpoll/audit", supportController.getPublicPollAbuseFeed);

module.exports = router;

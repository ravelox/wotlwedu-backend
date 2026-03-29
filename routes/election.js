const express = require("express");

const Security = require("../util/security");
const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");

const router = express.Router();

const electionController = require("../controllers/election");
const publicElectionController = require("../controllers/publicelection");
const publicInviteRateLimit = createRateLimiter({
  max: Config.authRateLimitInviteManageMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many public invite management attempts",
});
const participationReminderRateLimit = createRateLimiter({
  max: Config.authRateLimitInviteManageMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many participation reminder attempts",
});

// Add election
router.post(
  "/",
  Security.checkCapability("election", ["add"]),
  electionController.putAddElection
);

router.get(
  "/:electionId/stats",
  Security.checkCapability("election",["view"]),
  electionController.getStats
);
router.get(
  "/:electionId/participation",
  Security.checkCapability("election", ["view"]),
  electionController.getParticipation
);
router.post(
  "/:electionId/remind",
  participationReminderRateLimit,
  Security.checkCapability("election", ["edit"]),
  electionController.postParticipationReminder
);
router.get(
  "/:electionId/public/stats",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicElectionStats
);
router.get(
  "/:electionId/invite",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicElectionInvites
);
router.get(
  "/public/trust",
  Security.checkCapability("election", ["view"]),
  publicElectionController.getPublicPollTrustProfile
);

// View single election or all elections
router.get(
  "/:electionId",
  Security.checkCapability("election", ["view"]),
  electionController.getSingleElection
);
router.get(
  "/",
  Security.checkCapability("election", ["view"]),
  electionController.getAllElection
);

// Edit an selection
router.put(
  "/:electionId",
  Security.checkCapability("election", ["edit"]),
  electionController.postUpdateElection
);

// Delete election
router.delete(
  "/:electionId",
  Security.checkCapability("election", ["delete"]),
  electionController.deleteElection
);

// Start election
router.post(
  "/:electionId/start",
  Security.checkCapability("election", ["edit"]),
  electionController.putStartElection
);

// Stop election
router.post(
  "/:electionId/stop",
  Security.checkCapability("election", ["edit"]),
  electionController.putStopElection
);
router.post(
  "/:electionId/public/enable",
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postEnablePublicElection
);
router.post(
  "/:electionId/public/disable",
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postDisablePublicElection
);
router.post(
  "/:electionId/invite",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postPublicElectionInvite
);
router.post(
  "/:electionId/invite/:inviteId/resend",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.postResendPublicElectionInvite
);
router.delete(
  "/:electionId/invite/:inviteId",
  publicInviteRateLimit,
  Security.checkCapability("election", ["edit"]),
  publicElectionController.deletePublicElectionInvite
);

module.exports = router;

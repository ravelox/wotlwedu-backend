const express = require("express");
const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");

const router = express.Router();
const publicElectionController = require("../controllers/publicelection");

const publicPollRateLimit = createRateLimiter({
  max: Config.authRateLimitPublicPollMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip",
  message: "Too many public poll requests",
});

const publicVoteRateLimit = createRateLimiter({
  max: Config.authRateLimitPublicVoteMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip",
  message: "Too many public poll vote attempts",
});

router.get("/:token", publicPollRateLimit, publicElectionController.getPublicElection);
router.post("/:token/session", publicPollRateLimit, publicElectionController.postPublicElectionSession);
router.post("/:token/vote", publicVoteRateLimit, publicElectionController.postPublicElectionVote);
router.post("/:token/report", publicPollRateLimit, publicElectionController.postPublicElectionReport);

module.exports = router;

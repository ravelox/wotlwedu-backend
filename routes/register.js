const express = require("express");

const router = express.Router();

const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");
const registerController = require("../controllers/register");

const registerRateLimit = createRateLimiter({
  max: Config.authRateLimitRegisterMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many registration attempts",
});

router.post("/confirm/:tokenId", registerRateLimit, registerController.getConfirmRegistration);
router.post("/", registerRateLimit, registerController.postRegisterUser);

module.exports = router;

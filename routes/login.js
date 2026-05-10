const express = require("express");

const Security = require("../util/security");
const Config = require("../config/wotlwedu");
const createRateLimiter = require("../util/rate-limit");

const router = express.Router();

const loginController = require("../controllers/login");

const loginRateLimit = createRateLimiter({
  max: Config.authRateLimitLoginMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many login attempts",
});
const resetRateLimit = createRateLimiter({
  max: Config.authRateLimitResetMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many password reset attempts",
});
const verify2faRateLimit = createRateLimiter({
  max: Config.authRateLimitVerify2faMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many 2FA verification attempts",
});
const socialLinkRateLimit = createRateLimiter({
  max: Config.authRateLimitSocialLinkMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip+body",
  message: "Too many social link confirmation attempts",
});
const inviteLookupRateLimit = createRateLimiter({
  max: Config.authRateLimitInviteLookupMax,
  windowMs: Config.authRateLimitWindowMs,
  keyMode: "ip",
  message: "Too many invite lookup attempts",
});

router.post(
  "/verify2fa",
  verify2faRateLimit,
  Security.bypassCheck,
  Security.checkAuthentication,
  loginController.verify2FA
);
router.get("/invite/:token", inviteLookupRateLimit, loginController.getInviteStatus);
router.post("/google", loginRateLimit, loginController.postGoogleLogin);
router.post("/google/link", socialLinkRateLimit, loginController.postConfirmSocialLink);
router.post("/social", loginRateLimit, loginController.postSocialLogin);
router.post("/social/link", socialLinkRateLimit, loginController.postConfirmSocialLink);
router.post(
  "/invite/:token/accept",
  Security.bypassCheck,
  Security.checkAuthentication,
  loginController.postAcceptInvite
);
router.post(
  "/invite/:token/decline",
  Security.bypassCheck,
  Security.checkAuthentication,
  loginController.postDeclineInvite
);

/* Must be authenticated to enable 2FA */
router.post("/2fa", Security.checkAuthentication, loginController.enable2FA);
router.post("/gentoken", Security.checkAuthentication, loginController.getGenerate2FAVerification);
router.post("/testtoken", Security.checkAuthentication, loginController.postGenerateTestBearer);
router.post("/testtoken/revoke", Security.checkAuthentication, loginController.postRevokeTestBearer);

router.post("/refresh", loginRateLimit, loginController.postRefreshLogin);
router.post("/resetreq", resetRateLimit, loginController.postRequestPasswordReset);
router.put("/password/:userid", resetRateLimit, loginController.putResetUserPassword);
router.post("/", loginRateLimit, loginController.postLogin);

module.exports = router;

const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const loginController = require("../controllers/login");

router.post("/verify2fa", Security.bypassCheck, Security.checkAuthentication, loginController.verify2FA);

/* Must be authenticated to enable 2FA */
router.post("/2fa", Security.checkAuthentication, loginController.enable2FA);
router.post("/gentoken", Security.checkAuthentication, loginController.getGenerate2FAVerification);
router.post("/testtoken", Security.checkAuthentication, loginController.postGenerateTestBearer);
router.post("/testtoken/revoke", Security.checkAuthentication, loginController.postRevokeTestBearer);

router.post("/refresh", loginController.postRefreshLogin);
router.post("/resetreq", loginController.postRequestPasswordReset);
router.put("/password/:userid", loginController.putResetUserPassword);
router.post("/", loginController.postLogin);

module.exports = router;

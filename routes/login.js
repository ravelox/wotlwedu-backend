const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const loginController = require("../controllers/login");

router.post("/verify2fa", Security.bypassCheck, Security.checkAuthentication, loginController.verify2FA);

/* Must be authenticated to enable 2FA */
router.get("/2fa", Security.checkAuthentication, loginController.enable2FA);
router.get("/gentoken", Security.checkAuthentication, loginController.getGenerate2FAVerification);

router.post("/refresh", loginController.postRefreshLogin);
router.post("/resetreq", loginController.postRequestPasswordReset);
router.put("/password/:userid", loginController.putResetUserPassword);
router.post("/", loginController.postLogin);

module.exports = router;

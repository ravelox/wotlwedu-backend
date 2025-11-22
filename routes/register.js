const express = require("express");

const router = express.Router();

const registerController = require("../controllers/register");

router.post("/confirm/:tokenId", registerController.getConfirmRegistration);
router.post("/", registerController.postRegisterUser);

module.exports = router;

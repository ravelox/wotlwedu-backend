const express = require("express");

const Security = require("../util/security");
const homeController = require("../controllers/home");

const router = express.Router();

router.get("/", Security.checkCapability("election", ["view"]), homeController.getHome);

module.exports = router;

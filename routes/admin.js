const express = require("express");

const adminController = require("../controllers/admin");

const router = express.Router();

router.get("/config", adminController.getConfig);

module.exports = router;

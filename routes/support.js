const express = require("express");

const supportController = require("../controllers/support");

const router = express.Router();

router.get("/auth/overview", supportController.getAuthAuditOverview);
router.get("/auth/audit", supportController.getAuthAuditFeed);

module.exports = router;

const express = require("express");

const router = express.Router();

const organizationController = require("../controllers/organization");

router.get("/:organizationId", organizationController.getOrganization);
router.get("/", organizationController.getAllOrganization);
router.post("/", organizationController.putAddOrganization);
router.put("/:organizationId", organizationController.postUpdateOrganization);
router.delete("/:organizationId", organizationController.deleteOrganization);

module.exports = router;

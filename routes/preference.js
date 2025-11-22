const express = require("express");
const Security = require("../util/security");

const router = express.Router();

const preferenceController = require("../controllers/preference");

router.get("/:preferenceName", preferenceController.getPreference);
router.get("/", preferenceController.getAllPreferences);
router.put("/:preferenceName", preferenceController.postUpdatePreference);
router.delete("/:preferenceName", preferenceController.deletePreference);

router.post("/", preferenceController.putAddPreference);

module.exports = router;

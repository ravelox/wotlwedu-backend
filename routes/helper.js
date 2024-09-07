const express = require("express");

const router = express.Router();

const helperController = require("../controllers/helper");

router.get("/status/object/:objectName", helperController.getStatusNames);
router.get("/status/object", helperController.getStatusNames)


router.get("/status/id/:statusName", helperController.getStatusId)

router.get("/status", helperController.getStatusNames);

module.exports = router;

const express = require("express");

const router = express.Router();

const tutorialController = require("../controllers/tutorial");

router.get("/poll", tutorialController.getPollTutorial);
router.post("/poll/start", tutorialController.postStartPollTutorial);
router.post("/poll/skip", tutorialController.postSkipPollTutorial);
router.post("/poll/enable", tutorialController.postEnablePollTutorial);

module.exports = router;

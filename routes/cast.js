const express = require("express");

const router = express.Router();

const voteController = require("../controllers/vote");

// Cast a vote throught the vote controller
router.post("/:voteId/decision", voteController.getCastVote);

module.exports = router;

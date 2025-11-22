const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const voteController = require("../controllers/vote");

// Get all the next available votes (for the logged in user)
router.get("/next/all", Security.checkCapability("vote",["view"]), voteController.getNextElectionVote)
// Get votes for a specific election
router.get("/election/:electionId", Security.checkCapability("vote",["view"]),voteController.getAllVote);
// Get the next available vote ( for the logged in user ) for a specific election
router.get("/:electionId/next", Security.checkCapability("vote",["view"]), voteController.getNextElectionVote)
// View single vote or all votes
router.get("/:voteId", Security.checkCapability("vote",["view"]),voteController.getSingleVote);
router.get("/", Security.checkCapability("vote",["view"]),voteController.getAllVote);

// Edit a vote
router.put("/:voteId", Security.checkCapability("vote",["edit"]),voteController.postUpdateVote);

// Add a vote
router.post("/", Security.checkCapability("vote",["add"]), voteController.putAddVote);

module.exports = router;

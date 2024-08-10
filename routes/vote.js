const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const voteController = require("../controllers/vote");

// View single vote or all votes
router.get("/:voteId", Security.checkCapability("vote",["view"]),voteController.getSingleVote);
router.get("/", Security.checkCapability("vote",["view"]),voteController.getAllVote);


// Get votes for a specific election
router.get("/election/:electionId", Security.checkCapability("vote",["view"]),voteController.getAllVote);

// Get the next available vote ( for the logged in user ) for a specific election
router.get("/:electionId/next", Security.checkCapability("vote",["view"]), voteController.getNextElectionVote)
// Get all the next available votes (for the logged in user)
router.get("/next/all", Security.checkCapability("vote",["view"]), voteController.getNextElectionVote)

// Edit a vote
router.post("/:voteId", Security.checkCapability("vote",["edit"]),voteController.postUpdateVote);

// Add a vote
router.put("/", Security.checkCapability("vote",["add"]), voteController.putAddVote);

module.exports = router;

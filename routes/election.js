const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const electionController = require("../controllers/election");

// Add election
router.put(
  "/",
  Security.checkCapability("election", ["add"]),
  electionController.putAddElection
);

router.get(
  "/:electionId/stats",
  Security.checkCapability("election",["view"]),
  electionController.getStats
);

// View single election or all elections
router.get(
  "/:electionId",
  Security.checkCapability("election", ["view"]),
  electionController.getSingleElection
);
router.get(
  "/",
  Security.checkCapability("election", ["view"]),
  electionController.getAllElection
);

// Edit an selection
router.post(
  "/:electionId",
  Security.checkCapability("election", ["edit"]),
  electionController.postUpdateElection
);

// Delete election
router.delete(
  "/:electionId",
  Security.checkCapability("election", ["delete"]),
  electionController.deleteElection
);

// Start election
router.put(
  "/:electionId/start",
  Security.checkCapability("election", ["edit"]),
  electionController.putStartElection
);

// Stop election
router.put(
  "/:electionId/stop",
  Security.checkCapability("election", ["edit"]),
  electionController.putStopElection
);

module.exports = router;

const express = require("express");

const router = express.Router();

const aiController = require("../controllers/ai");

router.get("/election/:electionId/recommendations", aiController.getElectionRecommendations);
router.post("/list/suggest-items", aiController.postListSuggestItems);
router.get("/election/:electionId/summary", aiController.getElectionSummary);
router.get("/notification/digest", aiController.getNotificationDigest);
router.get("/election/:electionId/suggest-participants", aiController.getSuggestParticipants);
router.post("/item/categorize", aiController.postCategorizeItemText);
router.post("/moderate", aiController.postModerateText);
router.get("/image/:imageId/describe", aiController.getImageDescription);
router.get("/preferences/defaults", aiController.getPreferenceDefaults);
router.post("/assistant/query", aiController.postAssistantQuery);

module.exports = router;

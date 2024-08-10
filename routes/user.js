const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const userController = require("../controllers/user");

/* These routes need to be a specific order to prevent the wrong controller being called */

router.get(  "/accept/:tokenId",  Security.checkCapability("user", ["edit"]),  userController.getAcceptFriendRequest);

router.get( "/friend", Security.checkCapability("user",["view"]), userController.getUserFriends)
router.get(  "/:userId/friend",  Security.checkCapability("user", ["view"]),  userController.getUserFriends);

router.get(  "/:userId",  Security.checkCapability("user", ["view"]),  userController.getUser);
router.get(  "/",  Security.checkCapability("user", ["view"]),  userController.getAllUser);

router.put(  "/block/:blockUser",  Security.checkCapability("user", ["edit"]),  userController.putBlockUser);
router.put(  "/:userId/block/:blockUser",  Security.checkCapability("user", ["edit"]),  userController.putBlockUser);

router.put(  "/:userId/friend/:friendId",  Security.checkCapability("user", ["edit"]),  userController.putAddFriend);
router.put(  "/",  Security.checkCapability("user", ["add"]),  userController.putAddUser);

router.post( "/request/:friendId", Security.checkCapability("user", ["edit"]), userController.putAddFriend)
router.post( "/request", userController.putAddFriend);
router.post(  "/:userId",  Security.checkCapability("user", ["edit"]),  userController.postUpdateUser);

router.delete(  "/relationship/:relationshipId",  Security.checkCapability("user", ["edit"]),  userController.deleteRelationship);
router.delete(  "/:userId/relationship/:relationshipId",  Security.checkCapability("user", ["edit"]),  userController.deleteRelationship);
router.delete( "/friend/:friendId", userController.deleteRelationship);
router.delete(  "/:userId/friend/:friendId",  Security.checkCapability("user", ["edit"]),  userController.deleteRelationship);

router.delete(  "/:userId/reassign/:ownerId",  Security.checkCapability("user", ["delete"]),  userController.deleteUser);
router.delete(  "/:userId",  Security.checkCapability("user", ["delete"]),  userController.deleteUser);

module.exports = router;

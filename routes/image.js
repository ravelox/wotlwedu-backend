const express = require("express");
const multer = require("multer");
const router = express.Router();

const Security = require("../util/security");
const imageController = require("../controllers/image");

router.get("/:imageId/notif/:notificationId", imageController.getImage);
router.get("/share/:imageId/recipient/:recipient", Security.checkCapability("image",["view"]), imageController.getShareImage);
router.get("/accept/:notificationId", Security.checkCapability("image",["view"]), imageController.getAcceptImage);
router.get(
  "/:imageId",
  Security.checkCapability("image", ["view"]),
  imageController.getImage
);
router.get(
  "/",
  Security.checkCapability("image", ["view"]),
  imageController.getAllImage
);

router.post(
  "/file/:imageId",
  Security.checkCapability("image", ["add"]),
  imageController.postImageFile
);

router.post(
  "/:imageId",
  Security.checkCapability("image", ["edit"]),
  imageController.postUpdateImage
);

router.put(
  "/",
  Security.checkCapability("image", ["add"]),
  imageController.putAddImage
);

router.delete(
  "/file/:imageId",
  Security.checkCapability("image", ["delete"]),
  imageController.deleteImageFile
);

router.delete(
  "/:imageId",
  Security.checkCapability("image", ["delete"]),
  imageController.deleteImage
);

module.exports = router;


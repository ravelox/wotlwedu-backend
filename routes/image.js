const express = require("express");
const router = express.Router();

const Security = require("../util/security");
const { imageUpload, validateImageUpload } = require("../util/upload-security");
const imageController = require("../controllers/image");

router.get("/:imageId/notif/:notificationId", imageController.getImage);
router.post("/share/:imageId/recipient/:recipient", Security.checkCapability("image",["view"]), imageController.getShareImage);
router.post("/accept/:notificationId", Security.checkCapability("image",["view"]), imageController.getAcceptImage);
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
  imageController.checkImageFileUploadAccess,
  imageUpload.single("imageUpload"),
  validateImageUpload,
  imageController.postImageFile
);

router.put(
  "/:imageId",
  Security.checkCapability("image", ["edit"]),
  imageController.postUpdateImage
);

router.post(
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

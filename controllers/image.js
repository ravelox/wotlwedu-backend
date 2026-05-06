const Util = require("util");
const { Op } = require("sequelize");
const FS = require("fs");
const Path = require("path");
const Sequelize = require("sequelize")

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const toBool = require("../util/tobool");
const CategoryScope = require("../util/categoryscope");
const { normalizeOptionalId } = require("../util/idnormalize");

const Helper = require("./helper");
const Notify = require("../util/notification");

const Config = require("../config/wotlwedu");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName, buildCategoryMenu } = require("../util/helpers");

const Image = require("../model/image");
const Category = require("../model/category");
const Item = require("../model/item");
const Friend = require("../model/friend");
const Notification = require("../model/notification");
const Workgroup = require("../model/workgroup");
const database = require("../util/database");

const Attributes = require("../model/attributes");

function generateIncludes(details, req) {
  let includes = [];
  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("category")) {
      includes.push({
        model: Category,
        attributes: Attributes.Category,
        where: { creator: req.authUserId },
        required: false,
      });
    }
  }
  return includes;
}

module.exports.getImage = async (req, res, next) => {
  const imageToFind = req.params.imageId;
  const notificationToFind = req.params.notificationId;
  let bypassSecurityCheck = false;

  const options = {};
  if (!imageToFind) return StatusResponse(res, 421, "No image ID provided");

  const whereCondition = {};
  whereCondition.id = imageToFind;

  if (notificationToFind) {
    const notification = await Helper.getNotification(notificationToFind);
    if (notification) {
      if (
        notification.userId === req.authUserId &&
        notification.objectId === imageToFind
      ) {
        bypassSecurityCheck = true;
      }
    }
  }

  const includes = generateIncludes(req.query.detail, req);

  const modImageAttributes = Attributes.Image.slice();
  modImageAttributes.push([
    Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
    "url",
  ]);
  options.where = whereCondition;
  options.attributes = modImageAttributes;
  options.include = includes;

  Image.findOne(options)
    .then(async (foundImage) => {
      if (!foundImage) return StatusResponse(res, 404, "Image not found");

      if (!bypassSecurityCheck) {
        if (foundImage.workgroupId) {
          const allowed = await Security.canAccessWorkgroup(req, foundImage.workgroupId);
          if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
        } else if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
          if (foundImage.creator !== req.authUserId) {
            return StatusResponse(res, 403, "Not authorized for this image");
          }
        }
      }

      return StatusResponse(res, 200, "OK", { image: foundImage });
    })
    .catch((err) => next(err));
};

module.exports.getAllImage = async (req, res, next) => {
  let userFilter = req.query.filter;
  const workgroupId = normalizeOptionalId(req.query.workgroupId).value;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};

  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;

  // Sort order
  options.order = [["name"]];

  let whereCondition = {};

  if (userFilter) {
    whereCondition = {
      [Op.or]: [
        { id: { [Op.like]: "%" + userFilter + "%" } },
        { name: { [Op.like]: "%" + userFilter + "%" } },
      ],
    };
  }

  if (workgroupId) {
    const foundWorkgroup = await Workgroup.findByPk(workgroupId, { raw: true });
    if (!foundWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
    const allowed = await Security.canAccessWorkgroup(req, foundWorkgroup);
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    whereCondition.workgroupId = workgroupId;
  } else if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    // Legacy creator-owned images
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail, req);

  const modImageAttributes = Attributes.Image.slice();
  modImageAttributes.push([
    Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
    "url",
  ]);
  options.where = whereCondition;
  options.include = includes;
  options.attributes = modImageAttributes;
  options.distinct = true;

  Image.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        images: [],
      });
    }

    const payload = {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      images: rows,
    };
    if (toBool(req.query.collapsible)) {
      payload.menu = buildCategoryMenu(rows, "images");
    }
    return StatusResponse(res, 200, "OK", payload);
  });
};

module.exports.postUpdateImage = (req, res, next) => {
  const imageToFind = req.params.imageId;
  if (!imageToFind) return StatusResponse(res, 421, "No image ID provided");

  Image.findByPk(imageToFind)
    .then(async (foundImage) => {
      if (!foundImage) return StatusResponse(res, 404, "Image not found");

      if (foundImage.workgroupId) {
        const allowed = await Security.canAccessWorkgroup(req, foundImage.workgroupId);
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
      } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
        if (foundImage.creator !== req.authUserId) {
          return StatusResponse(res, 403, "Not authorized for this image");
        }
      }

      if (req.body.name) foundImage.name = req.body.name;
      if (req.body.description) foundImage.description = req.body.description;
      if (req.body.filename) foundImage.filename = req.body.filename;
      if (req.body.contentType) foundImage.contentType = req.body.contentType;
      if (req.body.statusId) foundImage.statusId = req.body.statusId;
      const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
        req,
        req.body.categoryId
      );
      if (!categoryResolution.ok) {
        return StatusResponse(
          res,
          categoryResolution.status,
          categoryResolution.message
        );
      }
      if (categoryResolution.hasValue) {
        foundImage.categoryId = categoryResolution.value;
      }

      const normalizedWorkgroup = normalizeOptionalId(req.body.workgroupId);
      if (normalizedWorkgroup.hasField) {
        if (normalizedWorkgroup.value === null) {
          if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
            return StatusResponse(res, 403, "Not authorized to clear workgroupId");
          }
          foundImage.workgroupId = null;
        } else if (normalizedWorkgroup.value) {
          const targetWorkgroup = await Workgroup.findByPk(normalizedWorkgroup.value, { raw: true });
          if (!targetWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
          const allowed = await Security.canAccessWorkgroup(req, targetWorkgroup);
          if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
          foundImage.workgroupId = targetWorkgroup.id;
        }
      }

      foundImage
        .save()
        .then((updatedImage) => {
          if (!updatedImage)
            return StatusResponse(res, 500, "Cannot update image");

          return StatusResponse(res, 200, "OK", {
            image: copyObject(updatedImage, Attributes.Image),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddImage = async (req, res, next) => {
  if (!req.body.name) return StatusResponse(res, 421, "No image name provided");

  if (!req.body.description)
    return StatusResponse(res, 421, "No description provided");

  // Populate the image properties
  const imageToAdd = new Image();
  imageToAdd.id = UUID("image");
  imageToAdd.creator = req.authUserId;
  imageToAdd.name = req.body.name;
  imageToAdd.description = req.body.description;
  if (req.body.filename) imageToAdd.filename = req.body.filename;
  if (req.body.contentType) imageToAdd.contentType = req.body.contentType;
  if (req.body.statusId) imageToAdd.statusId = req.body.statusId;
  const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
    req,
    req.body.categoryId
  );
  if (!categoryResolution.ok) {
    return StatusResponse(
      res,
      categoryResolution.status,
      categoryResolution.message
    );
  }
  if (categoryResolution.hasValue) {
    imageToAdd.categoryId = categoryResolution.value;
  }

  const normalizedWorkgroup = normalizeOptionalId(req.body.workgroupId);
  if (normalizedWorkgroup.value) {
    const targetWorkgroup = await Workgroup.findByPk(normalizedWorkgroup.value, { raw: true });
    if (!targetWorkgroup) return StatusResponse(res, 421, "Workgroup not found");
    const allowed = await Security.canAccessWorkgroup(req, targetWorkgroup);
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    imageToAdd.workgroupId = targetWorkgroup.id;
  }

  // Save the image to the database
  imageToAdd
    .save()
    .then((addedImage) => {
      if (!addedImage) return StatusResponse(res, 500, "Cannot add image");

      return StatusResponse(res, 200, "OK", {
        image: copyObject(addedImage, Attributes.Image),
      });
    })
    .catch((err) => next(err));
};

module.exports.deleteImage = (req, res, next) => {
  const imageToFind = req.params.imageId;
  if (!imageToFind) return StatusResponse(res, 421, "No image ID provided");

  Image.findByPk(imageToFind)
    .then(async (foundImage) => {
      if (!foundImage) return StatusResponse(res, 404, "Image not found");

      if (foundImage.workgroupId) {
        const allowed = await Security.canAccessWorkgroup(req, foundImage.workgroupId);
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
      } else if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
        if (foundImage.creator !== req.authUserId) {
          return StatusResponse(res, 403, "Not authorized for this image");
        }
      }

      // Remove the image ID from any item
      Item.update({ imageId: null }, { where: { imageId: foundImage.id } })
        .then(() => {
          foundImage
            .destroy()
            .then((removedImage) => {
              if (!removedImage)
                return StatusResponse(res, 500, "Cannot delete image");

              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.postImageFile = (req, res, next) => {
  const imageToFind = req.params.imageId;

  if (!imageToFind) return StatusResponse(res, 421, "No image ID provided");
  if (!req.file) return StatusResponse(res, 421, "No image provided");

  if (req.file.path) {

    // Update the filename details on the image object
    Image.findByPk(imageToFind)
      .then(async (foundImage) => {
        if (!foundImage) return StatusResponse(res, 421, "No image found");

        if (foundImage.workgroupId) {
          const allowed = await Security.canAccessWorkgroup(req, foundImage.workgroupId);
          if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
        } else if (!Security.getVerdict(req.verdicts, "add").isAdmin) {
          if (foundImage.creator !== req.authUserId) {
            return StatusResponse(res, 403, "Not authorized for this image");
          }
        }

        foundImage.filename = req.file.filename;
        foundImage
          .save()
          .then((updatedImage) => {
            if (!updatedImage)
              return StatusResponse(res, 500, "Cannot save image to storage");
                        return StatusResponse(res, 200, "OK", {
              filename: updatedImage.filename,
            });
          })
          .catch((err) => next(err));
      })
      .catch((err) => next(err));
  }
};

module.exports.deleteImageFile = (req, res, next) => {
  const imageToFind = req.params.imageId;
  if (!imageToFind) return StatusResponse(res, 421, "No image ID provided");

  Image.findByPk(imageToFind)
    .then(async (foundImage) => {
      if (!foundImage)
        return StatusResponse(res, 400, "No image found");

      if (foundImage.workgroupId) {
        const allowed = await Security.canAccessWorkgroup(req, foundImage.workgroupId);
        if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
      } else if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
        if (foundImage.creator !== req.authUserId) {
          return StatusResponse(res, 403, "Not authorized for this image");
        }
      }

      if (foundImage.filename) {
        FS.unlink(Config.imageDir + foundImage.filename, (err) => {
          return StatusResponse(res, 200, "OK");
        });
      } else {
        return StatusResponse(res, 200, "OK");
      }
    })
    .catch((err) => next(err));
};

// This is a 2 stage process:
// 1. Sender posts a notification to share
// 2. Recipient must be a friend (not pending) at the time (check is made in code) to accept
module.exports.getShareImage = async (req, res, next) => {
  const imageToShare = req.params.imageId;
  const recipientId = req.params.recipient;

  if (!imageToShare || !recipientId)
    return StatusResponse(res, 421, "Must have image ID and recipient Id");

  const friendStatus = await getStatusIdByName("Friend");

  const friendWhere = {
    userId: req.authUserId,
    friendId: recipientId,
    statusId: friendStatus,
  };

  Friend.findOne({ where: friendWhere }).then(async (foundFriendship) => {
    if (!foundFriendship) return StatusResponse(res, 421, "Not friends");

    const imageShareNotification = await getStatusIdByName("Share Image");
    await Notify.sendNotification(
      req.authUserId,
      recipientId,
      imageShareNotification,
      imageToShare,
      req.authName + " wants to share an image"
    );
    return StatusResponse(res, 200, "OK");
  });
};

module.exports.getAcceptImage = (req, res, next) => {
  const notificationId = req.params.notificationId;

  if (!notificationId)
    return StatusResponse(res, 421, "No notification Id provided");

  database
    .transaction(async (transaction) => {
      const foundNotification = await Notification.findByPk(notificationId, {
        transaction: transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!foundNotification)
        return StatusResponse(res, 404, "Notification not found");

      if (foundNotification.userId !== req.authUserId)
        return StatusResponse(
          res,
          421,
          "Notification is not for the current user"
        );

      const imageShareNotification = await getStatusIdByName("Share Image");
      if (foundNotification.type !== imageShareNotification)
        return StatusResponse(res, 421, "Notification is not an image share");

      const friendStatus = await getStatusIdByName("Friend");
      const activeFriendship = await Friend.findOne({
        where: {
          userId: foundNotification.senderId,
          friendId: req.authUserId,
          statusId: friendStatus,
        },
        transaction: transaction,
      });

      if (!activeFriendship)
        return StatusResponse(res, 421, "Share is no longer valid");

      const imageToShare = foundNotification.objectId;
      const copiedImage = await Helper.copyImage(imageToShare, req.authUserId, {
        transaction: transaction,
      });

      if (!copiedImage)
        return StatusResponse(res, 500, "Unable to copy image");

      await foundNotification.destroy({ transaction: transaction });
      return { ok: true, userId: req.authUserId, notificationId: notificationId };
    })
    .then(async (result) => {
      if (!result || result.ok !== true) return result;

      await Notify.emitNotificationEvent(result.userId, "deleted", {
        notificationId: result.notificationId,
        notification: null,
      });
      return StatusResponse(res, 200, "OK");
    })
    .catch((err) => next(err));
};

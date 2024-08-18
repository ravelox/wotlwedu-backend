const Util = require("util");
const { Op } = require("sequelize");
const FS = require("fs");
const Path = require("path");
const Sequelize = require("sequelize")

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");

const Helper = require("./helper");
const Notify = require("../util/notification");

const Config = require("../config/wotlwedu");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName } = require("../util/helpers");

const Image = require("../model/image");
const Category = require("../model/category");
const Item = require("../model/item");
const Friend = require("../model/friend");
const Notification = require("../model/notification");

const Attributes = require("../model/attributes");

function generateIncludes(details) {
  let includes = [];
  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("category")) {
      includes.push({ model: Category, attributes: Attributes.Category });
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

  if (!bypassSecurityCheck) {
    if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
      whereCondition.creator = req.authUserId;
    }
  }

  const includes = generateIncludes(req.query.detail);

  const modImageAttributes = Attributes.Image.slice();
  modImageAttributes.push([
    Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
    "url",
  ]);
  options.where = whereCondition;
  options.attributes = modImageAttributes;
  options.include = includes;

  Image.findOne(options)
    .then((foundImage) => {
      if (!foundImage) return StatusResponse(res, 404, "Image not found");
      return StatusResponse(res, 200, "OK", { image: foundImage });
    })
    .catch((err) => next(err));
};

module.exports.getAllImage = (req, res, next) => {
  let userFilter = req.query.filter;
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
      [Op.or]: [{ name: { [Op.like]: "%" + userFilter + "%" } }],
    };
  }

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

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

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      images: rows,
    });
  });
};

module.exports.postUpdateImage = (req, res, next) => {
  const imageToFind = req.params.imageId;
  if (!imageToFind) return StatusResponse(res, 421, "No image ID provided");

  let whereCondition = {};
  whereCondition.id = imageToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }
  Image.findOne({ where: whereCondition })
    .then((foundImage) => {
      if (!foundImage) return StatusResponse(res, 404, "Image not found");

      if (req.body.name) foundImage.name = req.body.name;
      if (req.body.description) foundImage.description = req.body.description;
      if (req.body.filename) foundImage.filename = req.body.filename;
      if (req.body.contentType) foundImage.contentType = req.body.contentType;
      if (req.body.statusId) foundImage.statusId = req.body.statusId;

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

module.exports.putAddImage = (req, res, next) => {
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

  let whereCondition = { id: imageToFind };
  if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Image.findOne({ where: whereCondition })
    .then((foundImage) => {
      if (!foundImage) return StatusResponse(res, 404, "Image not found");

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
    const whereCondition = { id: imageToFind };

    if (!Security.getVerdict(req.verdicts, "add").isAdmin) {
      whereCondition.creator = req.authUserId;
    }

    Image.findOne({ where: whereCondition })
      .then((foundImage) => {
        if (!foundImage) return StatusResponse(res, 421, "No image found");

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

  const whereCondition = { id: imageToFind };
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Image.findOne({ where: whereCondition })
    .then((foundImage) => {
      if (!foundImage)
        return StatusResponse(res, 400, "No image found", { whereCondition });

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

  Notification.findByPk(notificationId).then(async (foundNotification) => {
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

    const imageToShare = foundNotification.objectId;

    Helper.copyImage(imageToShare, req.authUserId)
      .then((copiedImage) => {
        if (!copiedImage)
          return StatusResponse(res, 500, "Unable to copy image");

        foundNotification.destroy().then(() => {
          return StatusResponse(res, 200, "OK");
        });
      })
      .catch((err) => next(err));
  });
};

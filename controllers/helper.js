const Util = require("util");
const { Op } = require("sequelize");
const FS = require("fs");
const Path = require("path");

const Config = require("../config/wotlwedu");

const StatusResponse = require("../util/statusresponse");
const Status = require("../model/status");
const Image = require("../model/image");
const Item = require("../model/item");
const List = require("../model/list");
const ListItem = require("../model/listitem");

const UUID = require("../util/mini-uuid");
const Notification = require("../model/notification");

module.exports.getStatusNames = (req, res, next) => {
  const objectName = req.params.objectName;
  const options = {};
  let whereCondition = {};

  if (objectName) {
    whereCondition = {
      [Op.or]: [{ object: objectName.toLowerCase() }, { object: "all" }],
    };
  }

  options.where = whereCondition;
  options.attributes = ["id", "object", "name"];
  options.order = ["id"];

  Status.findAll(options)
    .then((result) => {
      if (!result) return StatusResponse(res, 200, "OK", { status: [] });

      return StatusResponse(res, 200, "OK", { status: result });
    })
    .catch((err) => next(err));
};

module.exports.getStatusId = (req, res, next) => {
  const statusName = req.params.statusName;
  const options = {};
  if (!statusName)
    return StatusResponse(res, 200, "OK", { id: -1, object: "none", name: "" });

  options.where = { name: statusName };
  options.attributes = ["id", "object", "name"];

  Status.findAll(options)
    .then((result) => {
      if (!result)
        return StatusResponse(res, 200, "OK", {
          id: -1,
          object: "none",
          name: "",
        });

      return StatusResponse(res, 200, "OK", {
        status: result,
        options: options,
      });
    })
    .catch((err) => next(err));
};

module.exports.copyImage = (origImageId, newOwnerId) => {
  const imageDir = Config.imageDir;

  return new Promise((resolve, reject) => {
    if (!origImageId || !newOwnerId)
      reject(new Error("Need image ID and owner"));

    Image.findByPk(origImageId, { raw: true })
    .then((foundImage) => {
      if (!foundImage) return reject(new Error("No image found"));

      const newImageId = UUID("image");

      // Copy the image file to the new filename
      const url = new URL(foundImage.url);
      const oldFileName = imageDir + "/" + Path.basename(url.pathname);
      const extension = Path.extname(url.pathname);
      const newFileName = imageDir + "/" + newImageId + extension;

      const fileExists = FS.existsSync(oldFileName);
      if (fileExists) {
        FS.copyFileSync(oldFileName, newFileName);
      }

      delete foundImage.id;
      delete foundImage.createdAt;
      delete foundImage.updatedAt;
      const newImage = new Image(foundImage);
      newImage.id = newImageId;
      newImage.url = Config.imageURL + newImageId + extension;

      // Important to set the new owner
      newImage.creator = newOwnerId;

      // Empty the category field
      newImage.categoryId = null;

      newImage
        .save()
        .then((imageCreated) => {
          if (!imageCreated)
            return reject(new Error("Cannot save new image record"));
          return resolve(imageCreated);
        })
        .catch((err) => reject(err));
    });
  });
};

module.exports.copyItem = (origItemId, newOwnerId) => {
  return new Promise((resolve, reject) => {
    if (!origItemId || !newOwnerId) reject(new Error("Need item ID and owner"));

    Item.findByPk(origItemId, { raw: true }).then(async (foundItem) => {
      if (!foundItem) reject(new Error("No item found"));
      let newImageId = null;
      // If there is an image attached, copy it and get the new Id
      if (foundItem.imageId) {
        const newImage = await this.copyImage(foundItem.imageId, newOwnerId);
        delete foundItem.imageId;
        if (newImage) foundItem.imageId = newImage.id;
      }

      delete foundItem.id;
      delete foundItem.createdAt;
      delete foundItem.updatedAt;
      foundItem.id = UUID("item");

      const newItem = new Item(foundItem);

      // Important to set the new owner
      newItem.creator = newOwnerId;
      // Empty the category field
      newItem.categoryId = null;

      newItem
        .save()
        .then((itemCreated) => {
          if (!itemCreated) reject(new Error("Cannot save new item record"));
          resolve(itemCreated);
        })
        .catch((err) => reject(err));
    });
  });
};

module.exports.copyList = (origListId, newOwnerId) => {
  return new Promise((resolve, reject) => {
    if (!origListId || !newOwnerId) reject(new Error("Need item ID and owner"));

    List.findByPk(origListId, { raw: true }).then(async (foundList) => {
      if (!foundList) reject(new Error("No list found"));

      delete foundList.id;
      delete foundList.createdAt;
      delete foundList.updatedAt;
      foundList.id = UUID("list");

      const newList = new List(foundList);

      // Important to set the new owner
      newList.creator = newOwnerId;
      // Empty the category field
      newList.categoryId = null;

      newList.save().then((listCreated) => {
        if (!listCreated) reject(new Error("Cannot save new item record"));

        // Now that the list is created, we can start copying the items from the original
        ListItem.findAll({ where: { listId: origListId } }).then(
          async (results) => {
            if (results) {
              for (let listitem of results) {
                await Item.findByPk(listitem.itemId).then(async (itemFound) => {
                  if (itemFound) {
                    const newItem = await this.copyItem(
                      itemFound.id,
                      newOwnerId
                    );

                    await newList
                      .addItem(newItem, {
                        through: { id: UUID("listitem"), creator: newOwnerId },
                      })
                      .then((addedItem) => {
                        if (!addedItem) reject("Cannot copy new item to list");
                      })
                      .catch((err) => reject(err));
                  }
                });
              }
            }
            resolve(newList);
          }
        );
      });
    });
  });
};

module.exports.getNotification = async (notificationId)=>{
  if(! notificationId ) return null;

  const notification = await Notification.findByPk( notificationId );
  return (notification? notification : null);
}

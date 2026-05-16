const database = require("./database");
const crypto = require("crypto");
const hibase32 = require("hi-base32");
const FS = require("fs");

const Status = require("../model/status");

const packageJSON = require("../package.json");
const Observability = require("./observability");

module.exports.package = packageJSON;

module.exports.getStatusIdByName = function (statusName) {
  if (!statusName) return -1;
  return Status.findOne({ where: { name: statusName } }).then((foundStatus) => {
    if (foundStatus) return foundStatus.id;
    return -1;
  });
};

module.exports.logComment = function (comment) {
  return Observability.requestLogger(comment);
};

// Copy all the specified attributes to a new object
module.exports.copyObject = function (obj, attr) {
  const returnObject = {};
  if (attr) {
    for (const k of attr) {
      returnObject[k] = obj[k];
    }
  }
  return returnObject;
};

// Group records by categoryId to support collapsible category menus in API responses.
module.exports.buildCategoryMenu = function (records, childKey) {
  const keyName = childKey || "items";
  const menuMap = new Map();

  for (const record of records || []) {
    const plainRecord =
      record && typeof record.get === "function" ? record.get({ plain: true }) : record;
    const categoryId = plainRecord && plainRecord.categoryId ? plainRecord.categoryId : null;
    const categoryName =
      plainRecord &&
      plainRecord.category &&
      plainRecord.category.name
        ? plainRecord.category.name
        : categoryId || "Uncategorized";
    const menuKey = categoryId || "__uncategorized__";

    if (!menuMap.has(menuKey)) {
      menuMap.set(menuKey, {
        categoryId: categoryId,
        categoryName: categoryName,
        collapsed: true,
        total: 0,
        [keyName]: [],
      });
    }

    const menuItem = menuMap.get(menuKey);
    menuItem.total += 1;
    menuItem[keyName].push(record);
  }

  const menu = Array.from(menuMap.values());
  menu.sort((a, b) => {
    if (a.categoryId === null && b.categoryId !== null) return 1;
    if (a.categoryId !== null && b.categoryId === null) return -1;
    return String(a.categoryName).localeCompare(String(b.categoryName));
  });

  return menu;
};

// Bulk update any column across all tables
module.exports.bulkUpdate = function (fieldUpdateList, whereCondition) {
  fieldUpdateList.forEach((fieldUpdate) => {
    Object.keys(fieldUpdate).forEach((columnName) => {
      Object.keys(database.models).forEach(async (model) => {
        const modelAttributes = database.models[model].getAttributes();
        if (columnName in modelAttributes) {
          await database.models[model].update(fieldUpdate, whereCondition);
        }
      });
    });
  });
};

module.exports.genBase32 = function () {
  const buffer = crypto.randomBytes(15);
  const base32 = hibase32.encode(buffer).replace(/=/g, "").substring(0, 24);
  return base32;
};

module.exports.deleteImageFile = function (images) {
  return new Promise((resolve, reject) => {
    let imageList;
    if (!images) resolve(true);

    if (Array.isArray(images)) {
      imageList = images.slice();
    } else {
      imageList = [images];
    }

    for (const i of imageList) {
      FS.unlink(i, (err) => {
        if (err) reject(err);
      });
    }
    resolve(true);
  });
};

module.exports.checkDBConnection = function () {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Testing database connection");
      await database.authenticate();
      console.log("Connection has been established successfully.");
      resolve(true);
    } catch (error) {
      console.log("Unable to connect to the database");
      reject(error);
    }
  });
};

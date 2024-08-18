const database = require("./database");
const crypto = require("crypto");
const hibase32 = require("hi-base32");
const FS = require("fs");

const Status = require("../model/status");

module.exports.getStatusIdByName = function (statusName) {
  if (!statusName) return -1;
  return Status.findOne({ where: { name: statusName } }).then((foundStatus) => {
    if (foundStatus) return foundStatus.id;
    return -1;
  });
};

module.exports.logComment = function (comment) {
  return function (req, res, next) {
    console.log(comment + " :: " + req.method + " :: " + req.originalUrl);
    next();
  };
};

// Copy all the specified attributes to a new object
module.exports.copyObject = function (obj, attr) {
  const returnObject = {};
  if (attr) {
    for (k of attr) {
      returnObject[k] = obj[k];
    }
  }
  return returnObject;
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

    for (i of imageList) {
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

// Code copied from https://www.npmjs.com/package/to-bool
// and modified to add "on" as a possible value
// "off" is implicitly false in that case

module.exports.toBool = function toBool(item) {
  switch(typeof item) {
    case "boolean":
      return item;
    case "function":
      return true;
    case "number":
      return item > 0 || item < 0;
    case "object":
      return !!item;
    case "string":
      item = item.toLowerCase();
      return ["true", "1","on"].indexOf(item) >= 0;
    case "symbol":
      return true;
    case "undefined":
      return false;

    default:
      throw new TypeError("Unrecognised type: unable to convert to boolean");
  }
};
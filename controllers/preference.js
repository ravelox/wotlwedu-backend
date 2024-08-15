const Util = require("util");

const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Config = require("../config/wotlwedu");

const { Op } = require("sequelize");

const Preference = require("../model/preference");

const Attributes = require("../model/attributes");

module.exports.getPreference = (req, res, next) => {
  const preferenceToFind = req.params.preferenceName;
  if (!preferenceToFind)
    return StatusResponse(res, 421, "No preference name provided");

  // The preference name might actually be a preference ID too
  const whereCondition = {
    [Op.or]: [{ name: preferenceToFind }, { id: preferenceToFind }],
    creator: req.authUserId,
  };

  Preference.findOne({
    where: whereCondition,
    attributes: Attributes.Preference,
  })
    .then((foundPreference) => {
      return StatusResponse(res, 200, "OK", { preference: foundPreference });
    })
    .catch((err) => next(err));
};

module.exports.getAllPreferences = (req, res, next) => {
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

  whereCondition.creator = req.authUserId;

  options.where = whereCondition;
  options.attributes = Attributes.Preference;
  options.distinct = true;

  Preference.findAndCountAll(options)
    .then(({ count, rows }) => {
      if (!rows) {
        return StatusResponse(res, 200, "OK", {
          total: 0,
          page: 1,
          itemsPerPage: itemsPerPage,
          preferences: [],
        });
      }

      return StatusResponse(res, 200, "OK", {
        total: count,
        page: page,
        itemsPerPage: itemsPerPage,
        preferences: rows,
      });
    })
    .catch((err) => next(err));
};

module.exports.postUpdatePreference = (req, res, next) => {
  const preferenceToFind = req.params.preferenceName;
  if (!preferenceToFind)
    return StatusResponse(res, 421, "No preference name provided");

  let whereCondition = { id: preferenceToFind, creator: req.authUserId };

  Preference.findOne({ where: whereCondition })
    .then((foundPreference) => {
      let updatedPreference;
      if (!foundPreference) {
        updatedPreference = new Preference();
        updatedPreference.id = UUID("pref");
        updatedPreference.creator = req.authUserId;
      } else {
        updatedPreference = foundPreference;
      }
      updatedPreference.name = req.body.name;
      updatedPreference.value = req.body.value;

      updatedPreference
        .save()
        .then((preferenceUpdated) => {
          if (!preferenceUpdated)
            return StatusResponse(res, 500, "Cannot update preference");

          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.putAddPreference = (req, res, next) => {
  // Populate the preference properties from the form
  const preferenceToAdd = new Preference();
  preferenceToAdd.name = req.body.name;
  preferenceToAdd.value = req.body.value;

  preferenceToAdd.creator = req.authUserId;
  preferenceToAdd.id = UUID("pref");

  // Check to see if the preference name already exists
  Preference.findOne({
    where: { name: preferenceToAdd.name, creator: preferenceToAdd.creator },
  })
    .then((foundPref) => {
      if (foundPref) return StatusResponse(res, 421, "Already exists");

      // Save the preference to the database
      preferenceToAdd
        .save()
        .then((addedPreference) => {
          if (!addedPreference)
            return StatusResponse(res, 500, "Cannot add preference");

          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deletePreference = (req, res, next) => {
  const preferenceToFind = req.params.preferenceName;
  if (!preferenceToFind)
    return StatusResponse(res, 421, "No preference name provided");

  const whereCondition = { id: preferenceToFind, creator: req.authUserId };
  Preference.findOne({ where: whereCondition })
    .then((foundPreference) => {
      if (!foundPreference)
        return StatusResponse(res, 404, "Preference not found");

      foundPreference
        .destroy()
        .then((removedPreference) => {
          if (!removedPreference)
            return StatusResponse(res, 500, "Cannot delete Preference");

          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

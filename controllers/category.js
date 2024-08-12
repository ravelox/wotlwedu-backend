const Util = require("util");

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, bulkUpdate } = require("../util/helpers");
const { Op } = require("sequelize");

const Config = require("../config/wotlwedu");

const Category = require("../model/category");

const Attributes = require("../model/attributes");

module.exports.getSingleCategory = (req, res, next) => {
  const categoryToFind = req.params.categoryId;
  if (!categoryToFind)
    return StatusResponse(res, 421, "No category ID provided");

  const options = {};
  const whereCondition = {};

  whereCondition.id = categoryToFind;

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  options.where = whereCondition;
  options.attributes = Attributes.Category;

  Category.findOne(options )
    .then((foundCategory) => {
      if (!foundCategory) return StatusResponse(res, 404, "Category not found");

      return StatusResponse(res, 200, { category: foundCategory });
    })
    .catch((err) => next(err));
};

module.exports.getAllCategory = (req, res, next) => {
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

  options.where = whereCondition;
  options.attributes = Attributes.Category;
  options.distinct = true;

  Category.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        categories: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      categories: rows,
    });
  });
};

module.exports.postUpdateCategory = (req, res, next) => {
  const categoryToFind = req.params.categoryId;
  if (!categoryToFind)
    return StatusResponse(res, 421, "No category ID provided");

  let whereCondition = {};

  whereCondition.id = categoryToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }
  Category.findOne({ where: whereCondition })
    .then((foundCategory) => {
      if (!foundCategory) return StatusResponse(res, 404, "Category not found");

      if (req.body.name) foundCategory.name = req.body.name;
      if (req.body.description)
        foundCategory.description = req.body.description;

      foundCategory
        .save()
        .then((updatedCategory) => {
          if (!updatedCategory)
            return StatusResponse(res, 500, "Unable to update Category");
          return StatusResponse(res, 200, "OK", {
            category: copyObject(updatedCategory, Attributes.Category),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddCategory = (req, res, next) => {
  const categoryName = req.body.name;

  if (!categoryName)
    return StatusResponse(res, 421, "No category name provided");

  // Check to see if this user has already created a category with this name
  Category.findOne({
    where: { creator: req.authUserId, name: categoryName },
  })
    .then((foundCategory) => {
      if (foundCategory)
        return StatusResponse(res, 421, "Category already exists");

      // Populate the Category properties
      const CategoryToAdd = new Category();
      CategoryToAdd.name = categoryName;
      CategoryToAdd.description = req.body.description;
      CategoryToAdd.id = UUID("category");
      CategoryToAdd.creator = req.authUserId;

      // Save the Category to the database
      CategoryToAdd.save()
        .then((addedCategory) => {
          if (!addedCategory)
            return StatusResponse(res, 500, "Cannot add Category");

          return StatusResponse(res, 200, "OK", {
            category: copyObject(addedCategory, Attributes.Category),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.deleteCategory = (req, res, next) => {
  const categoryToFind = req.params.categoryId;
  if (!categoryToFind)
    return StatusResponse(res, 421, "No category ID provided");

  let whereCondition = { id: categoryToFind };

  if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  Category.findOne({ where: whereCondition })
    .then(async (foundCategory) => {
      if (!foundCategory) return StatusResponse(res, 404, "Category not found");

      // Remove the category ID from all the objects that have it
      const updates = [{ categoryId: null }];
      await bulkUpdate(updates, {
        where: { categoryId: foundCategory.id },
      });

      // Now delete the category
      foundCategory
        .destroy()
        .then((deletedCategory) => {
          if (!deletedCategory)
            return StatusResponse(res, 500, "Cannot delete category");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

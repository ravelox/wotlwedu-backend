const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize");

const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName } = require("../util/helpers");
const Notify = require("../util/notification");

const Election = require("../model/election");
const Group = require("../model/group");
const List = require("../model/list");
const Item = require("../model/item");
const User = require("../model/user");
const Category = require("../model/category");
const Vote = require("../model/vote");
const Image = require("../model/image");
const Status = require("../model/status");

const Attributes = require("../model/attributes");

function generateIncludes(details) {
  const includes = [];

  includes.push({
    model: Status,
    attributes: Attributes.Status,
  });

  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("group")) {
      includes.push({
        model: Group,
        attributes: Attributes.Group,
        include: [
          {
            model: User,
            attributes: Attributes.User,
            through: { attributes: [] },
          },
        ],
      });
    }
    if (splitDetail.includes("list")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn(
          "CONCAT",
          Config.imageURL,
          Sequelize.col("list.items.image.filename")
        ),
        "url",
      ]);
      includes.push({
        model: List,
        attributes: Attributes.List,
        include: [
          {
            model: Item,
            attributes: Attributes.Item,
            through: { attributes: [] },
            include: [{ model: Image, attributes: modImageAttributes }],
          },
        ],
      });
    }
    if (splitDetail.includes("category")) {
      includes.push({
        model: Category,
        attributes: Attributes.Category,
      });
    }
    if (splitDetail.includes("image")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("image.filename")),
        "url",
      ]);
      includes.push({
        model: Image,
        attributes: modImageAttributes,
      });
    }
  }

  return includes;
}

module.exports.getSingleElection = (req, res, next) => {
  const electionToFind = req.params.electionId;
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  const whereCondition = {};
  whereCondition.id = electionToFind;

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  const options = {};

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Election;

  Election.findOne(options)
    .then((foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      return StatusResponse(res, 200, "OK", { election: foundElection });
    })
    .catch((err) => next(err));
};

module.exports.getAllElection = (req, res, next) => {
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
      [Op.or]: [
        { name: { [Op.like]: "%" + userFilter + "%" } },
        { description: { [Op.like]: "%" + userFilter + "%" } },
      ],
    };
  }

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const detail = req.query.detail;
  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Election;
  options.distinct = true;

  Election.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        elections: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      elections: rows,
    });
  });
};

module.exports.postUpdateElection = (req, res, next) => {
  const options = {};
  const whereCondition = {};
  const electionToFind = req.params.electionId;
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  whereCondition.id = electionToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  options.where = whereCondition;

  Election.findOne(options)
    .then((foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      if (req.body.name) foundElection.name = req.body.name;
      if (req.body.description)
        foundElection.description = req.body.description;

      if (req.body.electionType)
        foundELection.electionType = req.body.electionType;
      if (req.body.groupId || req.body.groupId === null)
        foundElection.groupId = req.body.groupId;
      if (req.body.categoryId || req.body.groupId === null)
        foundElection.categoryId = req.body.categoryId;
      if (req.body.statusId) foundElection.statusId = req.body.statusId;
      if (req.body.listId || req.body.listId === null)
        foundElection.listId = req.body.listId;
      if (req.body.imageId || req.body.imageId === null)
        foundElection.imageId = req.body.imageId;
      if (req.body.expiration) foundElection.expiration = req.body.expiration;

      foundElection
        .save()
        .then((updatedElection) => {
          if (!updatedElection)
            return StatusResponse(res, 500, "Cannot update election");
          return StatusResponse(res, 200, "OK", {
            election: copyObject(updatedElection, Attributes.Election),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddElection = async (req, res, next) => {
  const options = {};

  const electionToAdd = new Election();
  electionToAdd.name = req.body.name;
  electionToAdd.description = req.body.description;
  electionToAdd.id = UUID("election");
  electionToAdd.creator = req.authUserId;

  if (req.body.listId) electionToAdd.listId = req.body.listId;
  if (req.body.electionType) electionToAdd.electionType = req.body.electionType;
  if (req.body.expiration) {
    electionToAdd.expiration =
      req.body.expiration.slice(0, 19).replace("T", " ") + "Z";
  }
  if (req.body.groupId) electionToAdd.groupId = req.body.groupId;
  if (req.body.categoryId) electionToAdd.categoryId = req.body.categoryId;

  foundStatus = await Status.findOne({ where: { name: "Not Started" } });
  if (foundStatus) electionToAdd.statusId = foundStatus.id;

  const whereCondition = {};
  whereCondition.creator = req.authUserId;
  whereCondition.name = electionToAdd.name;
  options.where = whereCondition;

  // Check for an election with the same name created by the current user
  Election.findOne(options)
    .then((foundElection) => {
      if (foundElection)
        return StatusResponse(res, 421, "Election already exists");

      // Save the election to the database
      electionToAdd.save().then((addedElection) => {
        if (!addedElection)
          return StatusResponse(res, 400, "Cannot add election");

        return StatusResponse(res, 200, "OK", {
          election: copyObject(addedElection, Attributes.Election),
        });
      });
    })
    .catch((err) => {
      next(err);
    });
};

module.exports.deleteElection = (req, res, next) => {
  const electionToFind = req.params.electionId;
  const options = {};
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  let whereCondition = {};
  whereCondition.id = electionToFind;

  if (!Security.getVerdict(req.verdicts, "delete").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  options.where = whereCondition;

  Election.findOne(options)
    .then((foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      // Delete any votes that were cast for this election
      Vote.destroy({ where: { electionId: foundElection.id } })
        .then(() => {
          foundElection
            .destroy()
            .then((electionDeleted) => {
              if (!electionDeleted)
                return StatusResponse(res, 500, "Cannot delete election");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putStartElection = (req, res, next) => {
  const options = {};
  const whereCondition = {};
  const electionToFind = req.params.electionId;

  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  whereCondition.id = electionToFind;
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  whereCondition["$status.name$"] = "Not Started";

  const includes = generateIncludes("list,group");
  options.include = includes;

  options.where = whereCondition;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      if (!(foundElection.group && foundElection.group.users))
        return StatusResponse(res, 404, "No voters configured");
      if (!(foundElection.list && foundElection.list.items))
        return StatusResponse(res, 404, "No items configured");

      // For each voter and each time, add an uncast vote
      const electionStartNotification = await getStatusIdByName(
        "Election Start"
      );
      const votesToAdd = [];
      for (voter of foundElection.group.users) {
        await Notify.sendNotification(
          req.authUserId,
          voter.id,
          electionStartNotification,
          foundElection.id,
          req.authName + " started a vote."
        );
        for (item of foundElection.list.items) {
          const vote = new Vote();

          vote.id = UUID("vote");
          vote.electionId = foundElection.id;
          vote.userId = voter.id;
          vote.itemId = item.id;
          vote.creator = req.authUserId;

          votesToAdd.push(vote);
        }
      }

      const voteErrors = [];
      // If there are votes to be added, add them
      for (vote of votesToAdd) {
        await vote
          .save()
          .then(() => {})
          .catch((err) => {
            voteErrors.push({
              userId: vote.userId,
              listItemId: vote.listItemId,
              error: err,
            });
          });
      }

      // Do this last
      // Mark the election as started
      Status.findOne({ where: { name: "In Progress" } })
        .then((foundStatus) => {
          let statusId = 0;
          if (foundStatus) statusId = foundStatus.id;

          foundElection.statusId = statusId;
          foundElection
            .save()
            .then((electionSaved) => {
              return StatusResponse(res, 200, "OK", {
                votes: votesToAdd,
                errors: voteErrors,
                election: foundElection,
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putStopElection = (req, res, next) => {
  let options = {};
  let whereCondition = {};
  let includes = [];

  const electionToFind = req.params.electionId;
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  whereCondition.id = electionToFind;
  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  includes = generateIncludes("list,group");

  whereCondition["$status.name$"] = "In Progress";
  options.where = whereCondition;

  options.include = includes;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      options = {};
      whereCondition = {};

      const statusRecord = await Status.findOne({
        where: { name: "Pending" },
      });

      whereCondition.electionId = foundElection.id;
      whereCondition.statusId = statusRecord.id;

      options.where = whereCondition;

      // Find all the uncast votes to delete
      // Delete any votes that were cast for this election
      Vote.destroy(options)
        .then((destroyedStatus) => {
          // Mark the election as stopped
          Status.findOne({ where: { name: "Stopped" } })
            .then((foundStatus) => {
              let statusId = 0;
              if (foundStatus) statusId = foundStatus.id;

              foundElection.statusId = statusId;
              foundElection
                .save()
                .then(() => {
                  return StatusResponse(res, 200, "OK");
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.getStats = async (req, res, next) => {
  const electionToFind = req.params.electionId;
  let returnStats = {};

  if (!electionToFind)
    return StatusResponse(res, 421, "No election Id provided");

  let options = {};
  let whereCondition = {};
  const attributes = ["userId", "itemId"];

  whereCondition.electionId = electionToFind;

  const includes = [];
  includes.push({ model: Status, attributes: Attributes.Status });
  includes.push({ model: User, attributes: Attributes.StatsUser });
  includes.push({ model: Item, attributes: Attributes.StatsItem });

  options.where = whereCondition;
  options.include = includes;
  options.attributes = attributes;
  options.distinct = true;
  options.raw = true;

  Election.findByPk(electionToFind)
    .then((foundElection) => {
      if (!foundElection)
        return StatusResponse(res, 200, "OK", {
          hasElection: false,
          hasStats: false,
          statistics: [],
          lookup: [],
        });

      Vote.findAll(options)
        .then((result) => {
          if (!result || result.length === 0) {
            return StatusResponse(res, 200, "OK", {
              hasElection: true,
              hasStats: false,
              statistics: [],
              lookup: [],
            });
          }

          let statistics = { Results: {}, "By Voter": {} };
          let lookup = {};

          for (r of result) {
            const statusName = r["status.name"];
            if (!statistics["Results"][r.itemId]) {
              statistics["Results"][r.itemId] = {};
            }
            if (!statistics["By Voter"][r.userId]) {
              statistics["By Voter"][r.userId] = {};
            }

            if (!statistics["Results"][r.itemId][statusName]) {
              statistics["Results"][r.itemId][statusName] = +0;
            }
            if (!statistics["By Voter"][r.userId][statusName]) {
              statistics["By Voter"][r.userId][statusName] = +0;
            }

            statistics["Results"][r.itemId][statusName] += 1;
            statistics["By Voter"][r.userId][statusName] += 1;

            if (!lookup[r.userId]) {
              lookup[r.userId] = r["user.name"];
            }
            if (!lookup[r.itemId]) {
              lookup[r.itemId] = r["item.name"];
            }
          }

          return StatusResponse(res, 200, "OK", {
            hasElection: true,
            hasStats: true,
            statistics: statistics,
            lookup: lookup,
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

const Util = require("util");
const Sequelize = require("sequelize");

const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { copyObject, getStatusIdByName } = require("../util/helpers");
const { Op } = require("sequelize");

const Config = require("../config/wotlwedu");

const Vote = require("../model/vote");

const Election = require("../model/election");
const User = require("../model/user");
const Item = require("../model/item");
const Image = require("../model/image");
const Status = require("../model/status");

const voteAttributes = ["id"];
const electionAttributes = ["id", "name", "description"];
const itemAttributes = ["id", "name", "description"];
const userAttributes = ["id", "firstName", "lastName", [
  Sequelize.fn(
    "CONCAT",
    Sequelize.col("firstName"),
    " ",
    Sequelize.col("lastName")
  ),
  "fullName",
],"alias", "email"];
const imageAttributes = ["id", "name", "description", "contentType", "url"];
const statusAttributes = ["name"];

function generateIncludes(details) {
  const includes = [];

  includes.push({ model: Status, attributes: statusAttributes });

  if (details) {
    const splitDetail = details.split(",");

    if (splitDetail.includes("election")) {
      const electionIncludes = {
        model: Election,
        attributes: electionAttributes,
      };
      if (splitDetail.includes("image")) {
        electionIncludes.include = {
          model: Image,
          attributes: imageAttributes,
        };
      }
      includes.push(electionIncludes);
    }
    if (splitDetail.includes("item")) {
      const itemIncludes = { model: Item, attributes: itemAttributes };
      if (splitDetail.includes("image")) {
        itemIncludes.include = { model: Image, attributes: imageAttributes };
      }
      includes.push(itemIncludes);
    }
    if (splitDetail.includes("user")) {
      const userIncludes = { model: User, attributes: userAttributes };
      if (splitDetail.includes("image")) {
        userIncludes.include = { model: Image, attributes: imageAttributes };
      }
      includes.push(userIncludes);
    }
  }
  return includes;
}

module.exports.getSingleVote = (req, res, next) => {
  const voteToFind = req.params.voteId;
  const whereCondition = {};
  const options = {};

  if (!voteToFind) return StatusResponse(res, 421, "No vote ID provided");

  whereCondition.id = voteToFind;
  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  options.where = whereCondition;
  options.attributes = voteAttributes;

  const includes = generateIncludes(req.query.detail);
  options.include = includes;

  Vote.findOne(options)
    .then((foundVote) => {
      if (!foundVote) return StatusResponse(res, 404, "Vote not found");

      return StatusResponse(res, 200, "OK", {
        vote: foundVote,
      });
    })
    .catch((err) => next(err));
};

module.exports.getAllVote = (req, res, next) => {
  const electionToFind = req.params.voteId;
  let userFilter = req.query.filter;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};

  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;

  let whereCondition = {};

  if (userFilter) {
    whereCondition = {
      [Op.or]: [
        { "$election.name$" : { [Op.like]: "%" + userFilter + "%" } },
        { "$item.name$": { [Op.like]: "%" + userFilter + "%" } },
      ],
    };
  }

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  if (electionToFind) whereCondition.electionId = electionToFind;

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.attributes = voteAttributes;
  options.distinct = true;
  options.include = includes;

  Vote.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        votes: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      votes: rows,
    });
  });
};

module.exports.postUpdateVote = (req, res, next) => {
  const voteToFind = req.params.voteId;
  if (!voteToFind) return StatusResponse(res, 421, "No vote ID provided");

  let whereCondition = {};

  whereCondition.id = voteToFind;

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }
  Vote.findOne({ where: whereCondition })
    .then((foundVote) => {
      if (!foundVote) return StatusResponse(res, 404, "Vote not found");

      if (req.body.electionId) foundVote.electionId = req.body.electionId;
      if (req.body.groupId) foundVote.groupId = req.body.groupId;
      if (req.body.userId) foundVote.userId = req.body.userId;
      if (req.body.listItemId) foundVote.listItemId = req.body.listItemId;
      if (req.body.statusId) foundVote.statusId = req.body.statusId;
      if (req.body.token) foundVote.token = req.body.token;
      if (req.body.tokenExpire) foundVote.tokenExpire = req.body.tokenExpire;

      foundVote
        .save()
        .then((updatedVote) => {
          if (!updatedVote)
            return StatusResponse(res, 500, "Unable to update Vote");
          return StatusResponse(res, 200, "OK", {
            vote: copyObject(updatedVote, voteAttributes),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddVote = (req, res, next) => {
  let whereCondition = {};

  if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const voteToAdd = new Vote();

  voteToAdd.creator = req.authUserId;
  voteToAdd.id = UUID("vote");

  if (req.body.electionId) foundVote.electionId = req.body.electionId;
  if (req.body.groupId) foundVote.groupId = req.body.groupId;
  if (req.body.userId) foundVote.userId = req.body.userId;
  if (req.body.listItemId) foundVote.listItemId = req.body.listItemId;
  if (req.body.statusId) foundVote.statusId = req.body.statusId;

  foundVote
    .save()
    .then((addedVote) => {
      if (!addedVote) return StatusResponse(res, 500, "Unable to add vote");
      return StatusResponse(res, 200, "OK", {
        vote: copyObject(addedVote, voteAttributes),
      });
    })
    .catch((err) => next(err));
};

module.exports.getCastVote = (req, res, next) => {
  const voteToFind = req.params.voteId;
  const decision = req.params.decision;

  if (!voteToFind) return StatusResponse(res, 421, "No vote ID provided");
  if (!decision) return StatusResponse(res, 421, "No decision provided");

  const whereCondition = {};
  whereCondition.id = voteToFind;
  whereCondition.userId = req.authUserId;
  whereCondition["$status.name$"] = "Pending";

  const includes = generateIncludes("");
  const options = {};
  options.include = includes;
  options.where = whereCondition;
  options.attributes = voteAttributes;
  options.distinct = true;

  Vote.findOne(options).then(async (foundVote) => {
    if (!foundVote) return StatusResponse(res, 404, "No vote found");

    const lowerCase = decision.toLowerCase();
    const statusToFind = lowerCase.charAt(0).toUpperCase() + lowerCase.slice(1);

    const statusId = await getStatusIdByName( statusToFind);

    if( ! statusId < 0 ) {
      return StatusResponse(res, 500, "No decision status found")
    }

    foundVote.statusId = statusId;
    foundVote.save().then((savedVote) => {
      if (!savedVote) return StatusResponse(res, 500, "Cannot cast vote");


      return StatusResponse(res, 200, "OK", { id: foundVote.id });
    });
  });
};

// Get the next vote for each election for the logged in user
module.exports.getNextElectionVote = (req, res, next) => {
  const electionToFind = req.params.electionId;
  const whereCondition = {};
  const options = {};

  if (electionToFind) {
    whereCondition.electionId = electionToFind;
    options.limit = 1;
  }

  whereCondition.userId = req.authUserId;
  whereCondition["$status.name$"] = "Pending";

  const includes = generateIncludes("user,image,election,item");

  options.where = whereCondition;
  options.attributes = voteAttributes;
  options.include = includes;
  options.distinct = true;
  options.order = ["electionId", "userId"];

  Vote.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) return StatusResponse(res, 200, "OK", { count: 0, rows: [] });

    // Filter out the possible votes to show one vote from each election
    let tmpVoteId = "";
    const filteredRows = rows.filter( (r)=>{
      const returnValue = r.election.id.toString() + r.user.id.toString() !== tmpVoteId.toString();
      tmpVoteId = r.election.id.toString() + r.user.id.toString();
      return returnValue;
    });

    return StatusResponse(res, 200, "OK", {
      count: filteredRows.length,
      rows: filteredRows,
    });
  });
};

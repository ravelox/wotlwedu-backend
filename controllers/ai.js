const { Op } = require("sequelize");

const StatusResponse = require("../util/statusresponse");
const { getStatusIdByName } = require("../util/helpers");
const AI = require("../util/ai");

const Election = require("../model/election");
const Vote = require("../model/vote");
const Item = require("../model/item");
const User = require("../model/user");
const Notification = require("../model/notification");
const Friend = require("../model/friend");
const Image = require("../model/image");
const Preference = require("../model/preference");
const ListItem = require("../model/listitem");

async function getElectionIfAccessible(electionId, authUserId) {
  const election = await Election.findOne({ where: { id: electionId } });
  if (!election) return null;

  if (election.creator === authUserId) return election;

  const hasVoted = await Vote.findOne({
    where: {
      electionId,
      userId: authUserId,
    },
  });

  if (hasVoted) return election;
  return null;
}

async function getElectionItems(election) {
  if (!election || !election.listId) return [];

  const listItems = await ListItem.findAll({
    where: { listId: election.listId },
    attributes: ["itemId"],
  });

  const itemIds = listItems.map((entry) => entry.itemId);
  if (itemIds.length === 0) return [];

  const foundItems = await Item.findAll({
    where: {
      id: {
        [Op.in]: itemIds,
      },
    },
  });

  const byId = {};
  foundItems.forEach((item) => {
    byId[item.id] = item;
  });

  return itemIds.map((itemId) => byId[itemId]).filter((item) => !!item);
}

module.exports.getElectionRecommendations = async (req, res, next) => {
  try {
    const electionId = req.params.electionId;
    if (!electionId) return StatusResponse(res, 421, "No election ID provided");

    const election = await getElectionIfAccessible(electionId, req.authUserId);
    if (!election) return StatusResponse(res, 404, "Election not found");

    const [items, votes] = await Promise.all([
      getElectionItems(election),
      Vote.findAll({ where: { electionId: election.id } }),
    ]);

    const result = AI.recommendElectionItems({
      election,
      items,
      votes,
      userId: req.authUserId,
    });

    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

module.exports.postListSuggestItems = async (req, res, next) => {
  try {
    const prompt = req.body.prompt;
    if (!prompt) return StatusResponse(res, 421, "No prompt provided");

    const result = AI.generateListSuggestions(prompt, req.body.count);
    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

module.exports.getElectionSummary = async (req, res, next) => {
  try {
    const electionId = req.params.electionId;
    if (!electionId) return StatusResponse(res, 421, "No election ID provided");

    const election = await getElectionIfAccessible(electionId, req.authUserId);
    if (!election) return StatusResponse(res, 404, "Election not found");

    const [items, votes] = await Promise.all([
      getElectionItems(election),
      Vote.findAll({ where: { electionId: election.id } }),
    ]);

    const result = AI.generateElectionSummary({
      election,
      items,
      votes,
    });

    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

module.exports.getNotificationDigest = async (req, res, next) => {
  try {
    const unreadStatusId = await getStatusIdByName("Unread");
    const notifications = await Notification.findAll({
      where: { userId: req.authUserId },
    });

    const digest = AI.createNotificationDigest({
      notifications,
      unreadStatusId,
    });

    return StatusResponse(res, 200, "OK", digest);
  } catch (err) {
    return next(err);
  }
};

module.exports.getSuggestParticipants = async (req, res, next) => {
  try {
    const electionId = req.params.electionId;
    if (!electionId) return StatusResponse(res, 421, "No election ID provided");

    const election = await getElectionIfAccessible(electionId, req.authUserId);
    if (!election) return StatusResponse(res, 404, "Election not found");

    const friendStatus = await getStatusIdByName("Friend");

    const [friends, votes] = await Promise.all([
      Friend.findAll({
        where: {
          userId: req.authUserId,
          statusId: friendStatus,
        },
      }),
      Vote.findAll({
        where: { electionId: election.id },
        attributes: ["userId"],
      }),
    ]);

    const friendIds = friends.map((friend) => friend.friendId);

    const users = friendIds.length
      ? await User.findAll({
          where: {
            id: {
              [Op.in]: friendIds,
            },
          },
          attributes: ["id", "firstName", "lastName", "alias", "lastLogin"],
        })
      : [];

    const result = AI.suggestParticipants({
      users,
      friends,
      votes,
      limit: req.query.limit,
    });

    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

module.exports.postCategorizeItemText = async (req, res, next) => {
  try {
    const text = req.body.text;
    if (!text) return StatusResponse(res, 421, "No text provided");

    const result = AI.categorizeText(text);
    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

module.exports.postModerateText = async (req, res, next) => {
  try {
    const text = req.body.text;
    if (!text) return StatusResponse(res, 421, "No text provided");

    const result = AI.moderateText(text);
    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

module.exports.getImageDescription = async (req, res, next) => {
  try {
    const imageId = req.params.imageId;
    if (!imageId) return StatusResponse(res, 421, "No image ID provided");

    const image = await Image.findOne({
      where: {
        id: imageId,
        creator: req.authUserId,
      },
    });

    if (!image) return StatusResponse(res, 404, "Image not found");

    const description = AI.describeImageFromMetadata(image);
    return StatusResponse(res, 200, "OK", description);
  } catch (err) {
    return next(err);
  }
};

module.exports.getPreferenceDefaults = async (req, res, next) => {
  try {
    const preferences = await Preference.findAll({
      where: {
        creator: req.authUserId,
      },
    });

    const defaults = AI.inferSmartDefaults(preferences);
    return StatusResponse(res, 200, "OK", defaults);
  } catch (err) {
    return next(err);
  }
};

module.exports.postAssistantQuery = async (req, res, next) => {
  try {
    const query = req.body.query;
    if (!query) return StatusResponse(res, 421, "No query provided");

    const preferences = await Preference.findAll({
      where: {
        creator: req.authUserId,
      },
      attributes: ["name", "value"],
    });

    const result = AI.answerAssistantQuery({
      query,
      preferences,
    });

    return StatusResponse(res, 200, "OK", result);
  } catch (err) {
    return next(err);
  }
};

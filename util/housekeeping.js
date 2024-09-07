const Util = require("util");
const Sequelize = require("sequelize");

const Attributes = require("../model/attributes");
const Election = require("../model/election");
const Status = require("../model/status");
const Vote = require("../model/vote");
const Notification = require("../model/notification");
const Friend = require("../model/friend");
const User = require("../model/user");

const Notify = require("./notification");
const { getStatusIdByName } = require("./helpers");
const IO = require("./wotlwedu-socketio")

module.exports.isElectionEnded = async (electionId) => {
  if (!electionId) return false;

  const options = {};

  const includes = [];
  includes.push({ model: Status, attributes: Attributes.Status });

  const whereCondition = {
    electionId: electionId,
  };
  whereCondition["$status.name$"] = "Pending";

  options.include = includes;
  options.where = whereCondition;

  // Look for any more Pending votes on this election
  // If none are found, the election is over
  const foundVotes = await Vote.findAll(options);
  return foundVotes.length === 0;
};

module.exports.isElectionExpired = async (electionId) => {
  if (!electionId) return false;

  const foundElection = Election.findByPk(electionId);

  if (!foundElection) return false;

  return foundElection.expiration < new Date();
};

module.exports.expireElections = () => {
  const options = {};

  const includes = [];
  includes.push({ model: Status, attributes: Attributes.Status });

  const whereCondition = {
    expiration: { [Sequelize.Op.lte]: Date.now() },
  };
  whereCondition["$status.name$"] = "In Progress";

  options.include = includes;
  options.where = whereCondition;

  Election.findAll(options).then(async (expiredElections) => {
    const endedStatusId = await getStatusIdByName("Ended");
    const electionExpiredNotification = await getStatusIdByName(
      "Election Expired"
    );

    // Need to go through each election
    // to set status and send notification to creator
    expiredElections.forEach((election) => {
      election.statusId = endedStatusId;
      election.save().then((savedElection) => {
        const notifOptions = {};
        const notifWhere = { objectId: election.id };
        notifWhere["$status.name$"] = "Unread";

        const notifIncludes = [];
        notifIncludes.push({ model: Status, attributes: Attributes.Status });

        notifOptions.include = notifIncludes;
        notifOptions.where = notifWhere;

        // Delete any unread notifications that relate to this election
        Notification.findAll(notifOptions)
          .then((foundNotifications) => {
            foundNotifications.forEach((n) => {
              n.destroy();
            });
          })
          .then(async () => {
            // Send an expired notification to the creator
            await Notify.sendNotification(
              "system",
              election.creator,
              electionExpiredNotification,
              election.id,
              "Expired election: " + election.name
            );
            IO.notifyUser(election.creator, "refresh")
          });
      });
    });
  });
};

module.exports.cleanRegistrations = () => {
  // If there is a registration token present
  // and has expired and there is no last login date
  // - Delete the user entry

  const options = {};

  const whereCondition = {
    registerToken: { [Sequelize.Op.not]: null },
    registerTokenExpire: { [Sequelize.Op.lte]: Date.now() },
    lastLogin: null,
  };

  options.where = whereCondition;

  User.findAll(options).then(async (hangingRegistrations) => {
    hangingRegistrations.forEach((r) => {
      r.destroy();
    });
  });
};

module.exports.cleanResetTokens = () => {
  const options = {};

  const whereCondition = {
    resetToken: { [Sequelize.Op.not]: null },
    resetTokenExpire: { [Sequelize.Op.lte]: Date.now() },
  };

  options.where = whereCondition;

  User.findAll(options).then(async (expiredReset) => {
    expiredReset.forEach((r) => {
      r.resetToken = null;
      r.resetTokenExpire = null;
      r.save();
    });
  });
};

module.exports.cleanFriendshipTokens = () => {
  const options = {};
  const whereCondition = {
    token: { [Sequelize.Op.not]: null },
    tokenExpire: { [Sequelize.Op.lte]: Date.now() },
  };
  options.where = whereCondition;

  Friend.findAll(options).then(async (expiredFriendTokens) => {
    expiredFriendTokens.forEach((t) => {
      t.token = null;
      t.tokenExpire = null;
      t.save();
    });
  });
};

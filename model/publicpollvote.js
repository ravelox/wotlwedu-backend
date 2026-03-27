const Sequelize = require("sequelize");
const database = require("../util/database");

const PublicPollVote = database.define(
  "publicpollvote",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    electionId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    itemId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    participantId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    decision: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "vote",
    },
    sourceIpHash: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    userAgentHash: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    creator: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: new Date(),
    },
  },
  {
    indexes: [
      { fields: ["electionId"] },
      { fields: ["participantId"] },
      { unique: true, fields: ["participantId", "itemId"] },
    ],
  }
);

module.exports = PublicPollVote;

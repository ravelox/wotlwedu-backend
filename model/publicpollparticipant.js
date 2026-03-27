const Sequelize = require("sequelize");
const database = require("../util/database");

const PublicPollParticipant = database.define(
  "publicpollparticipant",
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
    sessionKeyHash: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    emailHash: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    displayName: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    consentState: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "anonymous",
    },
    lastSeenAt: {
      type: Sequelize.DATE,
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
      { fields: ["sessionKeyHash"] },
      { unique: true, fields: ["electionId", "sessionKeyHash"] },
    ],
  }
);

module.exports = PublicPollParticipant;

const Sequelize = require("sequelize");
const database = require("../util/database");

const PublicPollInvite = database.define(
  "publicpollinvite",
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
    creatorUserId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    recipientEmail: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    recipientEmailHash: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    inviteToken: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    acceptedAt: {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    },
    acceptedByParticipantId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    revokedAt: {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    },
    lastSentAt: {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    },
    sendCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
      { fields: ["creatorUserId"] },
      { fields: ["recipientEmailHash"] },
      { unique: true, fields: ["electionId", "recipientEmailHash"] },
      { unique: true, fields: ["inviteToken"] },
    ],
  }
);

module.exports = PublicPollInvite;

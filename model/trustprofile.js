const Sequelize = require("sequelize");
const database = require("../util/database");

const TrustProfile = database.define(
  "trustprofile",
  {
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    trustTier: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "new",
    },
    emailVerified: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    canSendExternalInvites: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    inviteQuotaDaily: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    inviteQuotaHourly: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxRecipientsPerPoll: {
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
    indexes: [{ fields: ["trustTier"] }, { fields: ["canSendExternalInvites"] }],
  }
);

module.exports = TrustProfile;

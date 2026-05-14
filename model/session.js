const Sequelize = require("sequelize");
const database = require("../util/database");

const Session = database.define(
  "session",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    refreshTokenHash: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    previousRefreshTokenHash: {
      type: Sequelize.STRING,
      defaultValue: null,
    },
    userAgent: {
      type: Sequelize.TEXT,
      defaultValue: null,
    },
    ipAddress: {
      type: Sequelize.STRING,
      defaultValue: null,
    },
    lastUsedAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    expiresAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    revokedAt: {
      type: Sequelize.DATE,
      defaultValue: null,
    },
    replayDetectedAt: {
      type: Sequelize.DATE,
      defaultValue: null,
    },
  },
  {
    indexes: [
      { fields: ["userId"] },
      { fields: ["expiresAt"] },
      { fields: ["revokedAt"] },
    ],
  }
);

module.exports = Session;

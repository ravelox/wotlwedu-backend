const Sequelize = require("sequelize");
const database = require("../util/database");

const AuthAudit = database.define(
  "authaudit",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    eventType: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    outcome: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    actorUserId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    targetUserId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    organizationId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    inviteId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    provider: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    email: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    ipAddress: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    userAgent: {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    message: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    metadata: {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    creator: {
      type: Sequelize.STRING,
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: new Date(),
    },
  },
  {
    indexes: [
      { fields: ["eventType"] },
      { fields: ["outcome"] },
      { fields: ["actorUserId"] },
      { fields: ["targetUserId"] },
      { fields: ["organizationId"] },
      { fields: ["inviteId"] },
      { fields: ["provider"] },
      { fields: ["email"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = AuthAudit;

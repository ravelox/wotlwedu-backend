const Sequelize = require("sequelize");
const database = require("../util/database");

const AbuseAudit = database.define(
  "abuseaudit",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    actorType: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "system",
    },
    actorUserId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    electionId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    eventType: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    outcome: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    ipHash: {
      type: Sequelize.STRING,
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
      { fields: ["actorUserId"] },
      { fields: ["electionId"] },
      { fields: ["eventType"] },
      { fields: ["outcome"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = AbuseAudit;

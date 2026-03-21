const Sequelize = require("sequelize");
const database = require("../util/database");

const OrganizationInvite = database.define(
  "organizationinvite",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    organizationId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    token: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    invitedByUserId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    acceptedByUserId: {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    },
    acceptedAt: {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    },
    expiresAt: {
      type: Sequelize.DATE,
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
      { fields: ["organizationId"] },
      { fields: ["email"] },
      { fields: ["token"], unique: true },
      { fields: ["organizationId", "email", "acceptedAt"] },
    ],
  }
);

module.exports = OrganizationInvite;

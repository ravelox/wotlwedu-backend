const Sequelize = require("sequelize");
const database = require("../util/database");

const SocialIdentity = database.define(
  "socialidentity",
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
    provider: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    subject: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING,
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
      { fields: ["userId"] },
      { fields: ["provider", "subject"], unique: true },
      { fields: ["userId", "provider"], unique: true },
    ],
  }
);

module.exports = SocialIdentity;

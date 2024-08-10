const Sequelize = require("sequelize");
const database = require("../util/database");
const User = require("./user");

const Vote = database.define(
  "vote",
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
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    itemId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    statusId: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    creator: {
      type: Sequelize.STRING,
      onDelete: "CASCADE",
      references: {
        model: User,
        key: "id",
      },
    },
    createdAt: {
      type: Sequelize.DATE,
    },
    updatedAt: {
      type: Sequelize.DATE,
    },
  },
  {
    indexes: [
      { fields: ["creator"] },
      { fields: ["userId"] },
      { fields: ["electionId"] },
    ],
  }
);

module.exports = Vote;

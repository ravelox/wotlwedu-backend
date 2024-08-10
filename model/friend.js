const Sequelize = require("sequelize");
const database = require("../util/database");

const Friend = database.define(
  "friend",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    statusId: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    friendId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    token: {
      type: Sequelize.STRING,
    },
    tokenExpire: {
      type: Sequelize.DATE,
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
    indexes: [{ fields: ["creator"] }],
  }
);

module.exports = Friend;

const Sequelize = require("sequelize");
const database = require("../util/database");
const User = require('./user')

const Notification = database.define(
  "notification",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: Sequelize.STRING,
      onDelete: "CASCADE",
      references: {
        model: User,
        key: "id",
      },
      allowNull: false,
    },
    type: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    objectId: {
      type: Sequelize.STRING,
    },
    text: {
      type: Sequelize.STRING,
    },
    senderId: {
      type: Sequelize.STRING,
      onDelete: "CASCADE",
      references: {
        model: User,
        key: "id",
      },
    },
    statusId: {
      type: Sequelize.INTEGER,
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
    indexes: [{ fields: ["creator"] }, { fields: ["userId"] }],
  }
);

module.exports = Notification;

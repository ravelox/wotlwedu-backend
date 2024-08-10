const Sequelize = require("sequelize");
const database = require("../util/database");

const User = require('./user')

const Election = database.define("election", {
  id: {
    type: Sequelize.STRING,
    allowNull: false,
    primaryKey: true,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  description: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  text: {
    type: Sequelize.STRING
  },
  listId: {
    type: Sequelize.STRING
  },
  imageId: {
    type: Sequelize.STRING
  },
  electionType: {
    type: Sequelize.INTEGER,
    defaultValue: 1
  },
  expiration: {
    type: Sequelize.DATE,
    allowNull: false,
  },
  groupId: {
    type: Sequelize.STRING
  },
  categoryId: {
    type: Sequelize.STRING,
  },
  statusId: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  creator: {
    type: Sequelize.STRING,
    onDelete: "CASCADE",
    references: {
      model: User,
      key: "id",
    },
  },
  updatedAt: {
    type: Sequelize.DATE,
    allowNull: false,
    defaultValue: new Date(),
  },
},
{
  indexes: [{ fields: ["creator"]}],
});

module.exports = Election;

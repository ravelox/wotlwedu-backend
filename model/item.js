const Sequelize = require("sequelize");
const database = require("../util/database");
const User = require('./user')

const Item = database.define("item", {
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
  imageId: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  url: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  location: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  categoryId: {
    type: Sequelize.STRING
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

module.exports = Item;

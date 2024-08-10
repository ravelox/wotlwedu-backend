const Sequelize = require("sequelize");
const database = require("../util/database");
const User = require('./user')

const List = database.define("list", {
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

module.exports = List;

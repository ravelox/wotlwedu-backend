const Sequelize = require("sequelize");
const database = require("../util/database");

const ListItem = database.define("listitem", {
  id: {
    type: Sequelize.STRING,
    allowNull: false,
    primaryKey: true,
  },
  listId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  itemId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  creator: {
    type: Sequelize.STRING
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

module.exports = ListItem;

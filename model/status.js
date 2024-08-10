const Sequelize = require("sequelize");
const database = require("../util/database");

const Status = database.define("status", {
  id: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    primaryKey: true,
  },
  object: {
    type: Sequelize.STRING,
    allowNull: false
  },
  name: {
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

module.exports = Status;

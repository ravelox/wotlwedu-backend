const Sequelize = require("sequelize");
const database = require("../util/database");

const Role = database.define("role", {
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
  protected: {
    type: Sequelize.BOOLEAN,
    default: false,
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

module.exports = Role;

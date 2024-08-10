const Sequelize = require("sequelize");
const database = require("../util/database");

const RoleCapability = database.define("rolecapability", {
  id: {
    type: Sequelize.STRING,
    allowNull: false,
    primaryKey: true,
  },
  roleId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  capabilityId: {
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

module.exports = RoleCapability;

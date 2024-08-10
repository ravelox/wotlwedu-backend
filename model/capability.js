const Sequelize = require("sequelize");
const database = require("../util/database");

const Capability = database.define("capability", {
  id: {
    type: Sequelize.STRING,
    allowNull: false,
    primaryKey: true,
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
    defaultValue: new Date(),
  },
},
{
  indexes: [{ fields: ["creator"]}],
}
);

module.exports = Capability;

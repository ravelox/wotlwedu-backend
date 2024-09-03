const Sequelize = require("sequelize");
const database = require("../util/database");

const Metadata = database.define("metadata", {
  name: {
    type: Sequelize.STRING,
    allowNull: false,
    primaryKey: true,
  },
  value: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  comment: {
    type: Sequelize.STRING,
    defaultValue: null,
  }
});

module.exports = Metadata;

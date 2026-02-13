const Sequelize = require("sequelize");
const database = require("../util/database");

const Organization = database.define(
  "organization",
  {
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
      allowNull: true,
      defaultValue: null,
    },
    active: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
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
    indexes: [{ fields: ["name"], unique: true }, { fields: ["creator"] }],
  }
);

module.exports = Organization;

const Sequelize = require("sequelize");
const database = require("../util/database");

const TestToken = database.define(
  "testtoken",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    creatorId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    expiresAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    revokedAt: {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    indexes: [{ fields: ["userId"] }, { fields: ["creatorId"] }, { fields: ["expiresAt"] }],
  }
);

module.exports = TestToken;

const Sequelize = require("sequelize");
const database = require("../util/database");

const RateLimit = database.define(
  "ratelimit",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    routeKey: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    count: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    resetAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
  },
  {
    indexes: [{ fields: ["resetAt"] }],
  }
);

module.exports = RateLimit;

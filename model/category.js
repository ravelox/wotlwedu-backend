const Sequelize = require("sequelize");
const database = require("../util/database");

const User = require("./user");

const Category = database.define(
  "category",
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
      allowNull: false,
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
    indexes: [{ fields: ["creator"] }],
  }
);

module.exports = Category;

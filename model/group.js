const Sequelize = require("sequelize");
const database = require("../util/database");
const User = require('./user')

const Group = database.define("group", {
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
  categoryId: {
    type: Sequelize.STRING
  },
  organizationId: {
    type: Sequelize.STRING,
    defaultValue: null,
  },
  listType: {
    type: Sequelize.INTEGER,
    defaultValue: 1,
  },
  active: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
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
  tableName: "circles",
  indexes: [{ fields: ["creator"]}, { fields: ["organizationId"] }],
});

module.exports = Group;

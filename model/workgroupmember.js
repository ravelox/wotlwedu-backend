const Sequelize = require("sequelize");
const database = require("../util/database");

const WorkgroupMember = database.define(
  "workgroupmember",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    workgroupId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    active: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
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
    indexes: [{ fields: ["creator"] }],
  }
);

module.exports = WorkgroupMember;

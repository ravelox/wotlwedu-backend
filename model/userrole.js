const Sequelize = require("sequelize");
const database = require("../util/database");

const UserRole = database.define("userrole", {
  id: {
    type: Sequelize.STRING,
    allowNull: false,
    primaryKey: true,
  },
  roleId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  userId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

module.exports = UserRole;

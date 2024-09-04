const Sequelize = require("sequelize");
const database = require("../util/database");

const SocketInfo = database.define(
  "socketinfo",
  {
    userId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    socketId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  },
  {
    indexes: [{fields: ["userId"]}, { fields: ["socketId"] }],
    freezeTableName: true
  }
);

module.exports = SocketInfo;

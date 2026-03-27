const Sequelize = require("sequelize");
const database = require("../util/database");

const ContactSuppression = database.define(
  "contactsuppression",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    channel: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "email",
    },
    recipient: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    recipientHash: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    reason: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "unsubscribe",
    },
    creator: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: new Date(),
    },
  },
  {
    indexes: [{ unique: true, fields: ["channel", "recipientHash"] }],
  }
);

module.exports = ContactSuppression;

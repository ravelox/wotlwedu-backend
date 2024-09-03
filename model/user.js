const Sequelize = require("sequelize");
const database = require("../util/database");

const User = database.define(
  "user",
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true,
    },
    firstName: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    lastName: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    alias: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    imageId: {
      type: Sequelize.STRING,
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    creator: {
      type: Sequelize.STRING,
    },
    lastLogin: {
      type: Sequelize.DATE,
    },
    active: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    admin: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    protected: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    verified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    enable2fa: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    secret2fa: {
      type: Sequelize.STRING,
      defaultValue: null,
    },
    token2fa: {
      type: Sequelize.STRING,
      defaultValue: null,
    },
    auth: {
      type: Sequelize.STRING,
    },
    resetToken: {
      type: Sequelize.STRING,
    },
    resetTokenExpire: {
      type: Sequelize.DATE,
    },
    refreshToken: {
      type: Sequelize.STRING,
    },
    refreshTokenExpire: {
      type: Sequelize.DATE,
    },
    registerToken: {
      type: Sequelize.STRING,
    },
    registerTokenExpire: {
      type: Sequelize.STRING,
    },
    changeToEmail: {
      type: Sequelize.STRING,
      defaultValue: null,
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: new Date(),
    },
  },
  {
    indexes: [{ fields: ["email"], unique: true }, { fields: ["creator"] }],
  }
);

module.exports = User;

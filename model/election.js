const Sequelize = require("sequelize");
const database = require("../util/database");

const User = require('./user')

const Election = database.define("election", {
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
  text: {
    type: Sequelize.STRING
  },
  listId: {
    type: Sequelize.STRING
  },
  imageId: {
    type: Sequelize.STRING
  },
  electionType: {
    type: Sequelize.INTEGER,
    defaultValue: 1
  },
  expiration: {
    type: Sequelize.DATE,
    allowNull: false,
  },
  groupId: {
    type: Sequelize.STRING
  },
  categoryId: {
    type: Sequelize.STRING,
  },
  statusId: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  workgroupId: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  publicAccessMode: {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: "private",
  },
  publicToken: {
    type: Sequelize.STRING,
    allowNull: true,
    defaultValue: null,
  },
  publicEnabledAt: {
    type: Sequelize.DATE,
    allowNull: true,
    defaultValue: null,
  },
  publicDisabledAt: {
    type: Sequelize.DATE,
    allowNull: true,
    defaultValue: null,
  },
  guestVotingEnabled: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  guestVoteLimitPerPoll: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 1000,
  },
  guestVoteLimitPerIpPerDay: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 100,
  },
  allowPlatformInvites: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  invitePolicy: {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: "none",
  },
  abuseStatus: {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: "normal",
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
  indexes: [{ fields: ["creator"] }, { fields: ["workgroupId"] }, { fields: ["publicToken"] }],
});

module.exports = Election;

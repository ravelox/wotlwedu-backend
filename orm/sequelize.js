const Sequelize = require('sequelize');
const Config = require('../config/wotlwedu');

const options = {
  host: Config.db_host,
  dialect: 'mariadb',
  omitNull: false,
};

if (Config.db_logging === false) {
  options.logging = false;
}

options.pool = {
  max: 5,
  min: 0,
  acquire: 30000,
  idle: 10000,
};

const sequelize = new Sequelize(
  Config.db_database,
  Config.db_user,
  Config.db_password,
  options
);

module.exports = sequelize;

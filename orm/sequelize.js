const Sequelize = require('sequelize');
const Config = require('../config/wotlwedu');

const dialect = (process.env.WOTLWEDU_DB_DIALECT || 'mariadb').toLowerCase();

const options = {
  host: Config.db_host,
  dialect: dialect,
  omitNull: false,
};

// Allow lightweight, in-memory databases for tests
if (dialect === 'sqlite') {
  delete options.host;
  options.storage = process.env.WOTLWEDU_DB_STORAGE || ':memory:';
}

// In test mode with sqlite, disable automatic FK constraints to keep schema simple
if (process.env.NODE_ENV === 'test' && dialect === 'sqlite') {
  options.define = Object.assign({}, options.define, { constraints: false });
}

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

const Config = require('../config/wotlwedu');

let adapter;

switch ((Config.db_type || 'sequelize').toLowerCase()) {
  case 'mongoose':
    adapter = require('../orm/mongoose');
    break;
  case 'pg':
  case 'postgres':
  case 'postgresql':
    adapter = require('../orm/postgres');
    break;
  default:
    adapter = require('../orm/sequelize');
    break;
}

module.exports = adapter;

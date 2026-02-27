const Config = require('../config/wotlwedu');

let adapter;
const forceSequelizeForUpdates =
  String(process.env.WOTLWEDU_FORCE_SEQUELIZE_FOR_UPDATES || "").toLowerCase() === "true";

if (forceSequelizeForUpdates) {
  adapter = require('../orm/sequelize');
} else {
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
}

module.exports = adapter;

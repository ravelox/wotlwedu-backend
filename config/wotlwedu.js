// Required for string to boolean conversations
// Do not remove
const Helpers = require("../util/helpers");

module.exports.app_port = process.env.WOTLWEDU_APP_PORT || 9876;
module.exports.app_listen = process.env.WOTLWEDU_APP_LISTEN || "0.0.0.0";

module.exports.db_host = process.env.WOTLWEDU_DB_HOST || "localhost";
module.exports.db_user = process.env.WOTLWEDU_DB_USER || "wotlwedu";
module.exports.db_database = process.env.WOTLWEDU_DB_NAME || "wotlwedu";
module.exports.db_password = process.env.WOTLWEDU_DB_PASSWORD;

module.exports.db_logging = Helpers.toBool( process.env.WOTLWEDU_DB_LOGGING || false );

module.exports.db_force_sync = Helpers.toBool( process.env.WOTLWEDU_DB_SYNC || true );

module.exports.jwtSecret = process.env.WOTLWEDU_JWT_SECRET;
module.exports.jwtExpiry = "1h";
module.exports.jwtRefreshExpiry = "2h";

module.exports.defaultItemsPerPage = 10;

module.exports.mailerSESAccessKey = process.env.AWS_ACCESS_KEY_ID;
module.exports.mailerSESSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
module.exports.mailerFromAddress = "admin@wotlwedu.net";
module.exports.mailerDisplayName = "Wotlwedu Admin";

baseApiUrl = process.env.WOTLWEDU_API_URL || "https://www.wotlwedu.com:9876/";
baseFrontendUrl =
  process.env.WOTLWEDU_FRONTEND_URL || "https://www.wotlwedu.com/";

module.exports.baseFrontendUrl = baseFrontendUrl;
module.exports.baseApiUrl = baseApiUrl;
module.exports.imageURL =
  process.env.WOTLWEDU_IMAGE_URL || baseApiUrl + "images/";
module.exports.imageDir = process.env.WOTLWEDU_IMAGE_DIR || "public/images/";

module.exports.ssl = Helpers.toBool( process.env.WOTLWEDU_SSL || true );
module.exports.sslKeyFile = process.env.WOTLWEDU_SSL_KEY || "server.key";
module.exports.sslCert = process.env.WOTLWEDU_SSL_CERT || "server.cert";

module.exports.defaultRoleName = "Default Role";

module.exports.corsOrigin = ["http://localhost:4200"];

module.exports.dump = () => {
  console.log("*___*___*___*___*___*");
  console.log("Config dump");
  console.log(module.exports);
  console.log("*___*___*___*___*___*");
};

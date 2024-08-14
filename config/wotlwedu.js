const db_password = `${process.env.WOTLWEDU_DB_PASSWORD}`;

module.exports.app_port = `${process.env.WOTLWEDU_APP_PORT}`;
module.exports.app_listen = "0.0.0.0";

module.exports.db_host = `${process.env.WOTLWEDU_DB_HOST}`;
module.exports.db_user = "wotlwedu";
module.exports.db_database = "wotlwedu";
module.exports.db_password = db_password;

module.exports.db_logging = false;

module.exports.db_force_sync = true;

module.exports.jwtSecret = `${process.env.WOTLWEDU_JWT_SECRET}`;
module.exports.jwtExpiry = "1h";
module.exports.jwtRefreshExpiry = "2h";

module.exports.defaultItemsPerPage = 10;

module.exports.mailerSESAccessKey = `${process.env.AWS_ACCESS_KEY_ID}`;
module.exports.mailerSESSecretKey = `${process.env.AWS_SECRET_ACCESS_KEY}`;
module.exports.mailerFromAddress = "admin@wotlwedu.net";
module.exports.mailerDisplayName = "Wotlwedu Admin";

baseApiUrl = "https://www.wotlwedu.com:9876/";
baseFrontendUrl = "https://www.wotlwedu.com/";

module.exports.baseFrontendUrl = baseFrontendUrl;
module.exports.baseApiUrl = baseApiUrl;
module.exports.imageURL = baseApiUrl + "images/";
module.exports.imageDir = "public/images/";

module.exports.ssl = true;
module.exports.sslKeyFile = "server.key";
module.exports.sslCert = "server.cert";

module.exports.defaultRoleName = "Default Role";

module.exports.corsOrigin = ["http://localhost:4200"];

// Required for string to boolean conversations
// Do not remove
const toBool = require("../util/tobool");

module.exports.app_port = process.env.WOTLWEDU_APP_PORT || 9876;
module.exports.app_listen = process.env.WOTLWEDU_APP_LISTEN || "0.0.0.0";

module.exports.db_host = process.env.WOTLWEDU_DB_HOST || "localhost";
module.exports.db_user = process.env.WOTLWEDU_DB_USER || "wotlwedu";
module.exports.db_database = process.env.WOTLWEDU_DB_NAME || "wotlwedu";
module.exports.db_password = process.env.WOTLWEDU_DB_PASSWORD;

module.exports.db_logging = toBool( process.env.WOTLWEDU_DB_LOGGING || false );

module.exports.db_force_sync = toBool( process.env.WOTLWEDU_DB_SYNC || true );

module.exports.jwtSecret = process.env.WOTLWEDU_JWT_SECRET;
module.exports.jwtExpiry = "1h";
module.exports.jwtRefreshExpiry = "2h";

module.exports.defaultItemsPerPage = 10;


//
// Set the required mail provider
//

// Mailgun requires an API key
// Set the following environment variable:
// WOTLWEDU_MAILGUN_API_KEY
const mailgun = require("../mailprovider/mailgun")

// Amazon SES
// Set the following environemnt variables:
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY
//const amazon = require("../mailprovider/amazonses");

// smtp mail provider
// Set the following environment variables:
// WOTLWEDU_SMTP_HOST
// WOTLWEDU_SMTP_PORT
// WOTLWEDU_SMTP_USER
// WOTLWEDU_SMTP_PASSWORD
//
// If TLS is required for submission, set the following environment variable
// WOTLWEDU_SMTP_SECURE to true
const smtp = require("../mailprovider/smtp")


// Set which mail provider to use
module.exports.mailerProvider = smtp;
module.exports.mailerFromAddress = "admin@wotlwedu.net";
module.exports.mailerDisplayName = "Wotlwedu Admin";

baseApiUrl = process.env.WOTLWEDU_API_URL || "https://api.wotlwedu.com:9876/";
baseFrontendUrl =
  process.env.WOTLWEDU_FRONTEND_URL || "https://www.wotlwedu.com";

module.exports.baseFrontendUrl = baseFrontendUrl;
module.exports.baseApiUrl = baseApiUrl;
module.exports.imageURL =
  process.env.WOTLWEDU_IMAGE_URL || baseApiUrl + "images/";
module.exports.imageDir = process.env.WOTLWEDU_IMAGE_DIR || "public/images/";

module.exports.ssl = toBool( process.env.WOTLWEDU_SSL || true );
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

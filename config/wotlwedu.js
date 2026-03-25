// Required for string to boolean conversions
// Do not remove
const toBool = require("../util/tobool");

module.exports.app_port = process.env.WOTLWEDU_APP_PORT || 9876;
module.exports.app_listen = process.env.WOTLWEDU_APP_LISTEN || "0.0.0.0";

module.exports.db_host = process.env.WOTLWEDU_DB_HOST || "localhost";
module.exports.db_user = process.env.WOTLWEDU_DB_USER || "wotlwedu";
module.exports.db_database = process.env.WOTLWEDU_DB_NAME || "wotlwedu";
module.exports.db_password = process.env.WOTLWEDU_DB_PASSWORD;

module.exports.db_logging = toBool(process.env.WOTLWEDU_DB_LOGGING || false);
// Select which ORM to use. Supported: sequelize (default), mongoose, pg
module.exports.db_type = process.env.WOTLWEDU_DB_TYPE || "sequelize";

module.exports.db_force_sync = toBool(process.env.WOTLWEDU_DB_SYNC || true);

module.exports.jwtSecret = process.env.WOTLWEDU_JWT_SECRET;
module.exports.jwtExpiry = process.env.WOTLWEDU_JWT_EXPIRY || "1h";
module.exports.jwtRefreshExpiry = process.env.WOTLWEDU_JWT_REFRESH_EXPIRY || "2h";
module.exports.googleClientId = process.env.WOTLWEDU_GOOGLE_CLIENT_ID || "";

module.exports.defaultItemsPerPage = 10;

//
// Set the required mail provider
//

// Mailgun requires an API key
// Set the following environment variable:
// WOTLWEDU_MAILGUN_API_KEY
const mailgun = require("../mailprovider/mailgun");

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
const smtp = require("../mailprovider/smtp");

// Set which mail provider to use
module.exports.mailerProvider = smtp;
module.exports.mailerFromAddress = "admin@wotlwedu.net";
module.exports.mailerDisplayName = "Wotlwedu Admin";

enable_ssl = toBool(process.env.WOTLWEDU_SSL || false);
module.exports.ssl = enable_ssl;

module.exports.sslKeyFile = process.env.WOTLWEDU_SSL_KEY || "server.key";
module.exports.sslCert = process.env.WOTLWEDU_SSL_CERT || "server.cert";

baseApiUrl = process.env.WOTLWEDU_API_URL || "http://localhost:9876/";
baseFrontendUrl =
  process.env.WOTLWEDU_FRONTEND_URL || "http://localhost:5173";

module.exports.baseFrontendUrl = baseFrontendUrl;
module.exports.baseApiUrl = baseApiUrl;
module.exports.imageURL =
  process.env.WOTLWEDU_IMAGE_URL || baseApiUrl + "images/";
module.exports.imageDir = process.env.WOTLWEDU_IMAGE_DIR || "public/images/";

module.exports.defaultRoleName = "Default Role";

const corsOriginsRaw =
  process.env.WOTLWEDU_CORS_ORIGINS ||
  "http://localhost:4200,http://localhost:5173,http://localhost:4173,http://localhost:9876";
module.exports.corsOrigin = corsOriginsRaw
  .split(",")
  .map((v) => v.trim())
  .filter((v) => v.length > 0);

module.exports.authRateLimitLoginMax =
  +(process.env.WOTLWEDU_RATE_LOGIN_MAX || 10);
module.exports.authRateLimitResetMax =
  +(process.env.WOTLWEDU_RATE_RESET_MAX || 5);
module.exports.authRateLimitVerify2faMax =
  +(process.env.WOTLWEDU_RATE_VERIFY2FA_MAX || 10);
module.exports.authRateLimitWindowMs =
  +(process.env.WOTLWEDU_RATE_WINDOW_MS || 60 * 1000);
module.exports.organizationInviteExpiryDays =
  +(process.env.WOTLWEDU_ORG_INVITE_EXPIRY_DAYS || 7);

module.exports.housekeepingInterval = 300;

module.exports.dump = () => {
  console.log("*___*___*___*___*___*");
  console.log("Config dump");
  console.log(module.exports);
  console.log("*___*___*___*___*___*");
};

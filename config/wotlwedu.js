// Required for string to boolean conversions
// Do not remove
const toBool = require("../util/tobool");

module.exports.nodeEnv = process.env.NODE_ENV || "development";
module.exports.isProduction = module.exports.nodeEnv === "production";

function parseTrustProxy(value) {
  if (value === undefined || value === null || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 0) return numericValue;
  return value;
}

module.exports.app_port = process.env.WOTLWEDU_APP_PORT || 9876;
module.exports.app_listen = process.env.WOTLWEDU_APP_LISTEN || "0.0.0.0";
module.exports.trustProxy = parseTrustProxy(process.env.WOTLWEDU_TRUST_PROXY);

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
module.exports.jwtRefreshCookieEnabled = toBool(
  process.env.WOTLWEDU_JWT_REFRESH_COOKIE_ENABLED || false
);
module.exports.jwtRefreshCookieName =
  process.env.WOTLWEDU_JWT_REFRESH_COOKIE_NAME || "wotlwedu_refresh";
module.exports.jwtRefreshCookieSameSite =
  process.env.WOTLWEDU_JWT_REFRESH_COOKIE_SAMESITE || "lax";
module.exports.jwtRefreshCookieSecure = toBool(
  process.env.WOTLWEDU_JWT_REFRESH_COOKIE_SECURE || module.exports.isProduction
);
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
module.exports.supportEmail =
  process.env.WOTLWEDU_SUPPORT_EMAIL || module.exports.mailerFromAddress;

enable_ssl = toBool(process.env.WOTLWEDU_SSL || false);
module.exports.ssl = enable_ssl;

module.exports.sslKeyFile = process.env.WOTLWEDU_SSL_KEY || "server.key";
module.exports.sslCert = process.env.WOTLWEDU_SSL_CERT || "server.cert";

baseApiUrl = process.env.WOTLWEDU_API_URL || "http://localhost:9876/";
baseFrontendUrl =
  process.env.WOTLWEDU_FRONTEND_URL || "http://localhost:5173";

module.exports.baseFrontendUrl = baseFrontendUrl;
module.exports.baseApiUrl = baseApiUrl;
module.exports.inviteLinkBaseUrl =
  process.env.WOTLWEDU_INVITE_LINK_BASE_URL || baseFrontendUrl;
module.exports.passwordResetLinkBaseUrl =
  process.env.WOTLWEDU_PASSWORD_RESET_LINK_BASE_URL || baseFrontendUrl;
module.exports.confirmationLinkBaseUrl =
  process.env.WOTLWEDU_CONFIRMATION_LINK_BASE_URL || baseFrontendUrl;
module.exports.imageURL =
  process.env.WOTLWEDU_IMAGE_URL ||
  process.env.WOTLWEDU_MEDIA_PUBLIC_BASE_URL ||
  baseApiUrl + "images/";
module.exports.imageDir = process.env.WOTLWEDU_IMAGE_DIR || "public/images/";
module.exports.mediaStorageProvider =
  (process.env.WOTLWEDU_MEDIA_STORAGE_PROVIDER || "local").toLowerCase();
module.exports.mediaStoragePublicBaseUrl =
  process.env.WOTLWEDU_MEDIA_PUBLIC_BASE_URL || module.exports.imageURL;
module.exports.mediaStorageKeyPrefix =
  process.env.WOTLWEDU_MEDIA_KEY_PREFIX || "pictures";
module.exports.s3Endpoint = process.env.WOTLWEDU_S3_ENDPOINT || "";
module.exports.s3Region = process.env.WOTLWEDU_S3_REGION || "us-east-1";
module.exports.s3Bucket = process.env.WOTLWEDU_S3_BUCKET || "";
module.exports.s3AccessKeyId = process.env.WOTLWEDU_S3_ACCESS_KEY_ID || "";
module.exports.s3SecretAccessKey = process.env.WOTLWEDU_S3_SECRET_ACCESS_KEY || "";
module.exports.s3ForcePathStyle = toBool(process.env.WOTLWEDU_S3_FORCE_PATH_STYLE || false);
module.exports.s3Tls = toBool(process.env.WOTLWEDU_S3_TLS || true);
module.exports.uploadMaxBytes =
  +(process.env.WOTLWEDU_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
module.exports.jsonBodyLimit = process.env.WOTLWEDU_JSON_BODY_LIMIT || "1mb";
module.exports.urlEncodedBodyLimit =
  process.env.WOTLWEDU_URLENCODED_BODY_LIMIT || module.exports.jsonBodyLimit;

module.exports.defaultRoleName = "Default Role";

const corsOriginsRaw =
  process.env.WOTLWEDU_CORS_ORIGINS ||
  "http://localhost:4200,http://localhost:5173,http://localhost:4173,http://localhost:9876";
module.exports.corsOrigin = corsOriginsRaw
  .split(",")
  .map((v) => v.trim())
  .filter((v) => v.length > 0);
module.exports.corsAllowNoOrigin = toBool(
  process.env.WOTLWEDU_CORS_ALLOW_NO_ORIGIN || !module.exports.isProduction
);
module.exports.corsCredentials = toBool(
  process.env.WOTLWEDU_CORS_CREDENTIALS || module.exports.jwtRefreshCookieEnabled
);

module.exports.authRateLimitLoginMax =
  +(process.env.WOTLWEDU_RATE_LOGIN_MAX || 10);
module.exports.authRateLimitRegisterMax =
  +(process.env.WOTLWEDU_RATE_REGISTER_MAX || 10);
module.exports.authRateLimitResetMax =
  +(process.env.WOTLWEDU_RATE_RESET_MAX || 5);
module.exports.authRateLimitVerify2faMax =
  +(process.env.WOTLWEDU_RATE_VERIFY2FA_MAX || 10);
module.exports.authRateLimitSocialLinkMax =
  +(process.env.WOTLWEDU_RATE_SOCIAL_LINK_MAX || 5);
module.exports.authRateLimitInviteLookupMax =
  +(process.env.WOTLWEDU_RATE_INVITE_LOOKUP_MAX || 30);
module.exports.authRateLimitInviteManageMax =
  +(process.env.WOTLWEDU_RATE_INVITE_MANAGE_MAX || 20);
module.exports.authRateLimitPublicPollMax =
  +(process.env.WOTLWEDU_RATE_PUBLIC_POLL_MAX || 60);
module.exports.authRateLimitPublicVoteMax =
  +(process.env.WOTLWEDU_RATE_PUBLIC_VOTE_MAX || 30);
module.exports.authRateLimitWindowMs =
  +(process.env.WOTLWEDU_RATE_WINDOW_MS || 60 * 1000);
module.exports.rateLimitStore =
  process.env.WOTLWEDU_RATE_LIMIT_STORE ||
  (module.exports.isProduction ? "database" : "memory");
module.exports.rateLimitFailOpen = toBool(
  process.env.WOTLWEDU_RATE_LIMIT_FAIL_OPEN || false
);
module.exports.organizationInviteExpiryDays =
  +(process.env.WOTLWEDU_ORG_INVITE_EXPIRY_DAYS || 7);
module.exports.publicPollTrustMinAccountAgeHours =
  +(process.env.WOTLWEDU_PUBLIC_TRUST_MIN_ACCOUNT_AGE_HOURS || 72);
module.exports.publicPollBasicInviteQuotaDaily =
  +(process.env.WOTLWEDU_PUBLIC_BASIC_INVITE_QUOTA_DAILY || 5);
module.exports.publicPollBasicInviteQuotaHourly =
  +(process.env.WOTLWEDU_PUBLIC_BASIC_INVITE_QUOTA_HOURLY || 3);
module.exports.publicPollBasicRecipientsPerPoll =
  +(process.env.WOTLWEDU_PUBLIC_BASIC_RECIPIENTS_PER_POLL || 20);
module.exports.publicPollInviteResendCooldownHours =
  +(process.env.WOTLWEDU_PUBLIC_INVITE_RESEND_COOLDOWN_HOURS || 72);
module.exports.publicPollGuestSessionTtlHours =
  +(process.env.WOTLWEDU_PUBLIC_GUEST_SESSION_TTL_HOURS || 168);
module.exports.authAuditStdout = toBool(
  process.env.WOTLWEDU_AUTH_AUDIT_STDOUT || true
);

module.exports.housekeepingInterval = 300;

module.exports.dump = () => {
  console.log("*___*___*___*___*___*");
  console.log("Config dump");
  console.log(module.exports);
  console.log("*___*___*___*___*___*");
};

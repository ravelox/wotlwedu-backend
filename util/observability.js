const Crypto = require("crypto");
const Http = require("http");
const Https = require("https");

const Config = require("../config/wotlwedu");
const database = require("./database");
const packageJSON = require("../package.json");

const startedAt = new Date();
const metrics = {
  requestsTotal: 0,
  requestsByRoute: new Map(),
  responsesByStatus: new Map(),
  requestDurationMsTotal: 0,
  errorsTotal: 0,
  readinessChecksTotal: 0,
  readinessFailuresTotal: 0,
};

function requestId() {
  if (typeof Crypto.randomUUID === "function") return Crypto.randomUUID();
  return Crypto.randomBytes(16).toString("hex");
}

function log(level, message, fields = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: "wotlwedu-backend",
    message,
    ...fields,
  };
  console.log(JSON.stringify(payload));
}

function requestContext(req, res, next) {
  const id =
    req.get("x-request-id") ||
    req.get("x-correlation-id") ||
    requestId();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

function recordRequest(req, res, routeLabel, startedAtMs) {
  const durationMs = Date.now() - startedAtMs;
  const statusCode = res.statusCode;
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  const routeKey = routeLabel || req.route?.path || req.path || "unknown";

  metrics.requestsTotal += 1;
  metrics.requestDurationMsTotal += durationMs;
  metrics.requestsByRoute.set(routeKey, (metrics.requestsByRoute.get(routeKey) || 0) + 1);
  metrics.responsesByStatus.set(statusClass, (metrics.responsesByStatus.get(statusClass) || 0) + 1);

  log(statusCode >= 500 ? "error" : "info", "http_request", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    route: routeKey,
    statusCode,
    statusClass,
    durationMs,
    remoteAddress: req.ip || req.socket?.remoteAddress || null,
    userId: req.authUserId || null,
    organizationId: req.authOrganizationId || null,
  });
}

function requestLogger(routeLabel) {
  return function (req, res, next) {
    const startedAtMs = Date.now();
    res.once("finish", () => recordRequest(req, res, routeLabel, startedAtMs));
    next();
  };
}

async function readinessStatus() {
  metrics.readinessChecksTotal += 1;
  const checks = {
    database: {
      ok: false,
    },
  };

  try {
    await database.authenticate();
    checks.database.ok = true;
  } catch (err) {
    checks.database.ok = false;
    checks.database.message = err.message;
    metrics.readinessFailuresTotal += 1;
  }

  const ready = Object.values(checks).every((check) => check.ok === true);
  return {
    ready,
    status: ready ? "ready" : "not_ready",
    version: packageJSON.version,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: startedAt.toISOString(),
    checks,
  };
}

function healthPayload() {
  return {
    status: "ok",
    version: packageJSON.version,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: startedAt.toISOString(),
  };
}

function metricLine(name, value, labels = {}) {
  const labelEntries = Object.entries(labels).filter(([, labelValue]) => labelValue !== undefined);
  const labelText = labelEntries.length
    ? `{${labelEntries.map(([key, labelValue]) => `${key}="${String(labelValue).replace(/"/g, '\\"')}"`).join(",")}}`
    : "";
  return `${name}${labelText} ${value}`;
}

function prometheusMetrics() {
  const lines = [
    "# HELP wotlwedu_backend_uptime_seconds Process uptime in seconds.",
    "# TYPE wotlwedu_backend_uptime_seconds gauge",
    metricLine("wotlwedu_backend_uptime_seconds", Math.floor(process.uptime())),
    "# HELP wotlwedu_backend_requests_total HTTP requests served by the API.",
    "# TYPE wotlwedu_backend_requests_total counter",
    metricLine("wotlwedu_backend_requests_total", metrics.requestsTotal),
  ];

  for (const [route, count] of metrics.requestsByRoute.entries()) {
    lines.push(metricLine("wotlwedu_backend_requests_by_route_total", count, { route }));
  }
  for (const [statusClass, count] of metrics.responsesByStatus.entries()) {
    lines.push(metricLine("wotlwedu_backend_responses_by_status_total", count, { status: statusClass }));
  }

  lines.push(
    "# HELP wotlwedu_backend_request_duration_ms_total Cumulative HTTP request duration in milliseconds.",
    "# TYPE wotlwedu_backend_request_duration_ms_total counter",
    metricLine("wotlwedu_backend_request_duration_ms_total", metrics.requestDurationMsTotal),
    "# HELP wotlwedu_backend_errors_total Errors passed to the API error handler.",
    "# TYPE wotlwedu_backend_errors_total counter",
    metricLine("wotlwedu_backend_errors_total", metrics.errorsTotal),
    "# HELP wotlwedu_backend_readiness_checks_total Readiness checks executed.",
    "# TYPE wotlwedu_backend_readiness_checks_total counter",
    metricLine("wotlwedu_backend_readiness_checks_total", metrics.readinessChecksTotal),
    "# HELP wotlwedu_backend_readiness_failures_total Readiness checks with at least one failed dependency.",
    "# TYPE wotlwedu_backend_readiness_failures_total counter",
    metricLine("wotlwedu_backend_readiness_failures_total", metrics.readinessFailuresTotal)
  );

  return `${lines.join("\n")}\n`;
}

function sendErrorReport(error, context = {}) {
  if (!Config.errorReportingWebhookUrl) return;

  const body = JSON.stringify({
    service: "wotlwedu-backend",
    version: packageJSON.version,
    timestamp: new Date().toISOString(),
    message: error.message,
    name: error.name,
    stack: Config.errorReportingIncludeStack ? error.stack : undefined,
    context,
  });
  const targetUrl = new URL(Config.errorReportingWebhookUrl);
  const client = targetUrl.protocol === "https:" ? Https : Http;
  const req = client.request(
    targetUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: Config.errorReportingTimeoutMs,
    },
    (res) => {
      res.resume();
    }
  );
  req.on("error", (err) => {
    log("warn", "error_report_failed", { error: err.message });
  });
  req.on("timeout", () => req.destroy(new Error("error reporting request timed out")));
  req.write(body);
  req.end();
}

function reportError(error, req) {
  metrics.errorsTotal += 1;
  const context = {
    requestId: req?.requestId || null,
    method: req?.method || null,
    path: req?.originalUrl || null,
    userId: req?.authUserId || null,
    organizationId: req?.authOrganizationId || null,
  };
  log("error", "request_error", {
    ...context,
    error: error.message,
    name: error.name,
    stack: Config.isProduction ? undefined : error.stack,
  });
  sendErrorReport(error, context);
}

function resetMetricsForTests() {
  metrics.requestsTotal = 0;
  metrics.requestsByRoute.clear();
  metrics.responsesByStatus.clear();
  metrics.requestDurationMsTotal = 0;
  metrics.errorsTotal = 0;
  metrics.readinessChecksTotal = 0;
  metrics.readinessFailuresTotal = 0;
}

module.exports = {
  healthPayload,
  log,
  prometheusMetrics,
  readinessStatus,
  reportError,
  requestContext,
  requestLogger,
  resetMetricsForTests,
};

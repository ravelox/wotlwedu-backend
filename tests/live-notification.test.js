const assert = require("assert");
const http = require("http");
const https = require("https");

function getConfig() {
  const enabled = process.env.WOTLWEDU_LIVE_NOTIFICATION === "1";
  const apiBase = process.env.WOTLWEDU_LIVE_API || "http://localhost:9876";
  const token = process.env.WOTLWEDU_LIVE_TOKEN;
  const userId = process.env.WOTLWEDU_LIVE_NOTIFICATION_USER_ID;
  const senderId = process.env.WOTLWEDU_LIVE_NOTIFICATION_SENDER_ID || userId;
  const statusId = +(process.env.WOTLWEDU_LIVE_NOTIFICATION_STATUS_ID || 100);
  const type = +(process.env.WOTLWEDU_LIVE_NOTIFICATION_TYPE || 109);
  const objectId = process.env.WOTLWEDU_LIVE_NOTIFICATION_OBJECT_ID || null;
  const text =
    process.env.WOTLWEDU_LIVE_NOTIFICATION_TEXT ||
    `Live notification test ${new Date().toISOString()}`;

  return {
    enabled,
    apiBase,
    token,
    payload: {
      userId,
      senderId,
      statusId,
      type,
      objectId,
      text,
    },
  };
}

function requestJson(method, fullUrl, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = client.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search || ""}`,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (_err) {
            parsed = { raw };
          }
          resolve({
            status: res.statusCode,
            body: parsed,
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = (addTest) => {
  const cfg = getConfig();
  if (!cfg.enabled) {
    return;
  }

  addTest("live notification: create one notification via API", async () => {
    if (!cfg.token) {
      throw new Error("integration skipped: set WOTLWEDU_LIVE_TOKEN");
    }
    if (!cfg.payload.userId) {
      throw new Error("integration skipped: set WOTLWEDU_LIVE_NOTIFICATION_USER_ID");
    }

    const createUrl = new URL("/notification", cfg.apiBase).toString();
    const res = await requestJson("POST", createUrl, cfg.token, cfg.payload);

    assert.strictEqual(
      res.status,
      200,
      `expected 200 from POST /notification; got ${res.status} body=${JSON.stringify(res.body)}`
    );
    assert.ok(
      res.body &&
        res.body.data &&
        res.body.data.notification &&
        res.body.data.notification.id,
      "response did not include data.notification.id"
    );

    const notificationId = res.body.data.notification.id;
    console.log(
      `LIVE NOTIFICATION CREATED id=${notificationId} recipient=${cfg.payload.userId} text="${cfg.payload.text}"`
    );
  });
};

const assert = require("assert");
const http = require("http");
const bodyParser = require("body-parser");
const express = require("express");

// Configure environment for in-memory sqlite before loading app/config
process.env.NODE_ENV = "test";
process.env.WOTLWEDU_DB_DIALECT = "sqlite";
process.env.WOTLWEDU_DB_STORAGE = ":memory:";
process.env.WOTLWEDU_DB_LOGGING = "false";
process.env.WOTLWEDU_JWT_SECRET = "testsecret";
process.env.WOTLWEDU_DB_SYNC = "true";

const database = require("../util/database");
const Associations = require("../model/associations");
const Mailer = require("../util/mailer");
const Organization = require("../model/organization");
const OrganizationInvite = require("../model/organizationinvite");
const Role = require("../model/role");
const SocialIdentity = require("../model/socialidentity");
const User = require("../model/user");
const Security = require("../util/security");

let skipReason = null;
try {
  require("sqlite3");
} catch (err) {
  skipReason = "sqlite3 not installed; cannot run integration tests";
}

const resolvedDialect =
  typeof database.getDialect === "function" ? database.getDialect() : null;
if (!skipReason && resolvedDialect && resolvedDialect !== "sqlite") {
  skipReason = `integration skipped: dialect ${resolvedDialect} (requires sqlite)`;
}

// Stub security to always authorize during tests
Security.checkAuthentication = (req, res, next) => {
  req.authUserId = "user_test";
  req.authName = "Test User";
  req.verdicts = [];
  req.isAdmin = true;
  req.isOrganizationAdmin = true;
  req.authOrganizationId = "org_test";
  next();
};
Security.checkCapability = (_objectToCheck, opList) => {
  return (req, res, next) => {
    req.authUserId = "user_test";
    req.verdicts = (opList || []).map((op) => ({
      op,
      isAuthorized: true,
      isAdmin: true,
    }));
    next();
  };
};

// Build an express app matching the production routing without starting a listener
function buildApp() {
  const baseApp = express();
  baseApp.use(bodyParser.json());

  const itemRoutes = require("../routes/item");
  const loginRoutes = require("../routes/login");
  const listRoutes = require("../routes/list");
  const notificationRoutes = require("../routes/notification");
  const organizationRoutes = require("../routes/organization");

  // Mirror app.js protected routes used in tests
  baseApp.use("/login", loginRoutes);
  baseApp.use("/item", Security.checkAuthentication, itemRoutes);
  baseApp.use("/list", Security.checkAuthentication, listRoutes);
  baseApp.use("/notification", Security.checkAuthentication, notificationRoutes);
  baseApp.use("/organization", Security.checkAuthentication, organizationRoutes);

  // Ping route
  baseApp.use(
    "/ping",
    Security.checkAuthentication,
    (req, res) => res.status(200).json({ status: 200, message: "OK" })
  );

  return baseApp;
}

// Minimal HTTP helper without external deps
function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    if (skipReason) {
      return reject(new Error(skipReason));
    }
    if (!server || !server.address()) {
      return reject(new Error("Server is not running"));
    }
    const payload = body ? JSON.stringify(body) : null;
    const addressInfo = server.address();
    const options = {
      method,
      path,
      host: addressInfo.address || "127.0.0.1",
      port: addressInfo.port,
      headers: payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          }
        : {},
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = (addTest) => {
  if (skipReason) {
    addTest(`integration skipped: ${skipReason}`, () => {
      console.warn(skipReason);
    });
    return;
  }

  let server;
  let app;
  let createdItemId;
  let Notification;
  let Status;

  Mailer.sendOrganizationInviteMessage = async () => "OK";

  addTest("setup test database", async () => {
    Associations.setup();
    if (resolvedDialect === "sqlite" && typeof database.query === "function") {
      await database.query("PRAGMA foreign_keys = OFF;");
    }
    await database.sync({ force: true });
    await Organization.create({
      id: "org_test",
      name: "Test Organization",
      active: true,
      creator: "user_test",
    });
    await Role.create({
      id: "role_default",
      name: "Default Role",
      description: "Default role",
      protected: false,
    });
    await User.create({
      id: "user_test",
      firstName: "Test",
      lastName: "User",
      alias: "tester",
      email: "test@example.com",
      organizationId: "org_test",
      creator: "user_test",
      active: true,
      admin: true,
    });
    await User.create({
      id: "user_sender",
      firstName: "Sender",
      lastName: "User",
      alias: "sender",
      email: "sender@example.com",
      organizationId: "org_test",
      creator: "user_test",
      active: true,
      admin: false,
    });

    Status = require("../model/status");
    Notification = require("../model/notification");

    await Status.bulkCreate([
      { id: 100, object: "notification", name: "Unread" },
      { id: 101, object: "notification", name: "Read" },
    ]);
  });

  addTest("start test server", async () => {
    app = buildApp();
    try {
      await new Promise((resolve, reject) => {
        server = app.listen(0, "127.0.0.1", resolve);
        server.on("error", reject);
      });
    } catch (err) {
      skipReason = `integration skipped: cannot start server (${err.message})`;
      server = null;
      throw new Error(skipReason);
    }
  });

  addTest("ping responds with OK", async () => {
    const res = await request(server, "GET", "/ping");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, "OK");
  });

  addTest("can create item via POST /item", async () => {
    const res = await request(server, "POST", "/item", {
      name: "Test Item",
      description: "Item description",
      url: "http://example.com",
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data && res.body.data.item && res.body.data.item.id);
    createdItemId = res.body.data.item.id;
  });

  addTest("list items via GET /item", async () => {
    const res = await request(server, "GET", "/item");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.ok(res.body.data.items.length >= 1);
  });

  addTest("list items ignores placeholder workgroup and paging values", async () => {
    const res = await request(
      server,
      "GET",
      "/item?workgroupId=%20undefined%20&page=undefined&items=0"
    );
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.strictEqual(res.body.data.page, 1);
    assert.ok(res.body.data.itemsPerPage >= 1);
  });

  addTest("create item ignores placeholder workgroupId in payload", async () => {
    const res = await request(server, "POST", "/item", {
      name: "Placeholder Workgroup Item",
      description: "Item description",
      url: "http://example.com/placeholder",
      workgroupId: " null ",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.item.workgroupId ?? null, null);
  });

  addTest("update item via PUT /item/:id", async () => {
    const res = await request(server, "PUT", `/item/${createdItemId}`, {
      name: "Updated Item",
      description: "Updated",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.item.name, "Updated Item");
  });

  addTest("delete item via DELETE /item/:id", async () => {
    const res = await request(server, "DELETE", `/item/${createdItemId}`);
    assert.strictEqual(res.status, 200);
  });

  addTest("notification list includes pagination metadata and newest-first ordering", async () => {
    await Notification.create({
      id: "notif_old",
      userId: "user_test",
      senderId: "user_sender",
      type: 103,
      text: "Older notification",
      statusId: 100,
      createdAt: new Date("2026-02-27T10:00:00Z"),
      updatedAt: new Date("2026-02-27T10:00:00Z"),
    });
    await Notification.create({
      id: "notif_new",
      userId: "user_test",
      senderId: "user_sender",
      type: 103,
      text: "Newer notification",
      statusId: 100,
      createdAt: new Date("2026-02-28T10:00:00Z"),
      updatedAt: new Date("2026-02-28T10:00:00Z"),
    });

    const res = await request(server, "GET", "/notification?page=1&items=1");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.page, 1);
    assert.strictEqual(res.body.data.itemsPerPage, 1);
    assert.strictEqual(res.body.data.total, 2);
    assert.ok(Array.isArray(res.body.data.notifications));
    assert.strictEqual(res.body.data.notifications.length, 1);
    assert.strictEqual(res.body.data.notifications[0].id, "notif_new");
  });

  addTest("notification unread count returns count payload", async () => {
    const res = await request(server, "GET", "/notification/unreadcount");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.unread, 2);
  });

  addTest("organization invite creates pending invite by email", async () => {
    const res = await request(server, "POST", "/organization/org_test/invite", {
      email: "social.invited@example.com",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.invite.organizationId, "org_test");
    assert.strictEqual(res.body.data.invite.email, "social.invited@example.com");
  });

  addTest("social login consumes pending org invite for first-time user", async () => {
    const res = await request(server, "POST", "/login/social", {
      provider: "google",
      subject: "google-subject-1",
      email: "social.invited@example.com",
      firstName: "Jane",
      lastName: "Doe",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.organizationId, "org_test");
    assert.strictEqual(res.body.data.organizationAdmin, false);
    assert.strictEqual(res.body.data.isNewUser, true);
    assert.ok(res.body.data.consumedInviteId);
    assert.strictEqual(res.body.data.provisionedOrganizationId, null);

    const invite = await OrganizationInvite.findByPk(res.body.data.consumedInviteId);
    assert.ok(invite.acceptedAt);
    assert.strictEqual(invite.acceptedByUserId, res.body.data.userId);

    const social = await SocialIdentity.findOne({
      where: { provider: "google", subject: "google-subject-1" },
    });
    assert.ok(social);
    assert.strictEqual(social.userId, res.body.data.userId);
  });

  addTest("social login provisions organization for first-time uninvited user", async () => {
    const res = await request(server, "POST", "/login/social", {
      provider: "apple",
      subject: "apple-subject-1",
      email: "social.new@example.com",
      firstName: "John",
      lastName: "Smith",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isNewUser, true);
    assert.ok(res.body.data.provisionedOrganizationId);
    assert.strictEqual(res.body.data.organizationId, res.body.data.provisionedOrganizationId);
    assert.strictEqual(res.body.data.organizationAdmin, true);

    const org = await Organization.findByPk(res.body.data.organizationId);
    assert.ok(org);
    assert.strictEqual(org.name, "J S's Organization");
  });

  addTest("social login reuses linked social identity on repeat sign-in", async () => {
    const res = await request(server, "POST", "/login/social", {
      provider: "apple",
      subject: "apple-subject-1",
      email: "social.new@example.com",
      firstName: "John",
      lastName: "Smith",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isNewUser, false);
    assert.ok(res.body.data.organizationId);
  });

  addTest("teardown server", async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await database.close();
  });
};

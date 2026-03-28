const assert = require("assert");
const http = require("http");
const bodyParser = require("body-parser");
const express = require("express");
const bcrypt = require("bcryptjs");

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
const AuthAudit = require("../model/authaudit");
const Organization = require("../model/organization");
const OrganizationInvite = require("../model/organizationinvite");
const Role = require("../model/role");
const SocialIdentity = require("../model/socialidentity");
const User = require("../model/user");
const Workgroup = require("../model/workgroup");
const Group = require("../model/group");
const GroupMember = require("../model/groupmember");
const List = require("../model/list");
const ListItem = require("../model/listitem");
const Item = require("../model/item");
const Election = require("../model/election");
const Vote = require("../model/vote");
const Image = require("../model/image");
const PublicPollInvite = require("../model/publicpollinvite");
const AbuseAudit = require("../model/abuseaudit");
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
  req.isSystemAdmin = true;
  req.isOrganizationAdmin = true;
  req.authOrganizationId = "org_test";
  next();
};
Security.checkCapability = (_objectToCheck, opList) => {
  return (req, res, next) => {
    req.authUserId = "user_test";
    req.isSystemAdmin = true;
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
  const electionRoutes = require("../routes/election");
  const publicElectionRoutes = require("../routes/publicelection");
  const supportRoutes = require("../routes/support");
  const userRoutes = require("../routes/user");
  const workgroupRoutes = require("../routes/workgroup");

  // Mirror app.js protected routes used in tests
  baseApp.use("/login", loginRoutes);
  baseApp.use("/public/election", publicElectionRoutes);
  baseApp.use("/item", Security.checkAuthentication, itemRoutes);
  baseApp.use("/list", Security.checkAuthentication, listRoutes);
  baseApp.use("/notification", Security.checkAuthentication, notificationRoutes);
  baseApp.use("/organization", Security.checkAuthentication, organizationRoutes);
  baseApp.use("/election", Security.checkAuthentication, electionRoutes);
  baseApp.use("/support", Security.checkAuthentication, supportRoutes);
  baseApp.use("/user", Security.checkAuthentication, userRoutes);
  baseApp.use("/workgroup", Security.checkAuthentication, workgroupRoutes);

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
  let pendingInviteToken;
  let publicElectionId;
  let publicListItemId;
  let publicElectionToken;
  let participationElectionId;

  Mailer.sendOrganizationInviteMessage = async () => "OK";
  Mailer.sendPublicPollInviteMessage = async () => "OK";

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
    await Organization.create({
      id: "org_filter",
      name: "Filter Organization",
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
      verified: true,
      admin: true,
      createdAt: new Date("2026-03-20T00:00:00Z"),
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
    await User.create({
      id: "user_password",
      firstName: "Pat",
      lastName: "Password",
      alias: "ppassword",
      email: "password.link@example.com",
      organizationId: "org_test",
      creator: "user_test",
      active: true,
      admin: false,
      auth: await bcrypt.hash("password123", 12),
    });
    await User.create({
      id: "user_social_only",
      firstName: "Sam",
      lastName: "Social",
      alias: "ssocial",
      email: "social.only@example.com",
      organizationId: "org_test",
      creator: "user_test",
      active: true,
      admin: false,
      auth: null,
    });
    await User.create({
      id: "user_filter_org",
      firstName: "Other",
      lastName: "Org",
      alias: "filterorg",
      email: "filter@example.com",
      organizationId: "org_filter",
      creator: "user_test",
      active: true,
      admin: false,
    });
    await User.create({
      id: "user_source_owner",
      firstName: "Source",
      lastName: "Owner",
      alias: "sourceowner",
      email: "source.owner@example.com",
      organizationId: "org_test",
      creator: "user_test",
      active: true,
      verified: true,
      admin: false,
    });
    await User.create({
      id: "user_target_owner",
      firstName: "Target",
      lastName: "Owner",
      alias: "targetowner",
      email: "target.owner@example.com",
      organizationId: "org_test",
      creator: "user_test",
      active: true,
      verified: true,
      admin: false,
    });
    await Workgroup.create({
      id: "workgroup_test",
      name: "Test Workgroup",
      description: "Primary test workgroup",
      organizationId: "org_test",
      creator: "user_test",
      listType: 0,
    });
    await Workgroup.create({
      id: "workgroup_filter",
      name: "Filter Workgroup",
      description: "Filtered test workgroup",
      organizationId: "org_filter",
      creator: "user_test",
      listType: 0,
    });
    await Group.create({
      id: "group_participation",
      name: "Participation Group",
      description: "Audience for participation summary",
      organizationId: "org_test",
      creator: "user_test",
    });
    await GroupMember.bulkCreate([
      {
        id: "groupmember_participation_1",
        groupId: "group_participation",
        userId: "user_test",
        active: true,
        creator: "user_test",
      },
      {
        id: "groupmember_participation_2",
        groupId: "group_participation",
        userId: "user_sender",
        active: true,
        creator: "user_test",
      },
      {
        id: "groupmember_participation_3",
        groupId: "group_participation",
        userId: "user_password",
        active: true,
        creator: "user_test",
      },
    ]);

    Status = require("../model/status");
    Notification = require("../model/notification");

    await Status.bulkCreate([
      { id: 100, object: "notification", name: "Unread" },
      { id: 101, object: "notification", name: "Read" },
      { id: 200, object: "election", name: "Not Started" },
      { id: 201, object: "election", name: "In Progress" },
      { id: 202, object: "election", name: "Ended" },
      { id: 300, object: "vote", name: "Pending" },
      { id: 301, object: "vote", name: "Yes" },
      { id: 302, object: "vote", name: "No" },
      { id: 303, object: "vote", name: "Maybe" },
    ]);

    const publicItem = await Item.create({
      id: "item_public",
      name: "Public Option",
      description: "Public item",
      url: "http://example.com/public",
      creator: "user_test",
    });
    publicListItemId = publicItem.id;
    const publicList = await List.create({
      id: "list_public",
      name: "Public List",
      description: "List for public poll",
      creator: "user_test",
    });
    await ListItem.create({
      id: "listitem_public",
      listId: publicList.id,
      itemId: publicItem.id,
      creator: "user_test",
    });
    const publicElection = await Election.create({
      id: "election_public",
      name: "Public Poll",
      description: "Election for public testing",
      listId: publicList.id,
      workgroupId: "workgroup_test",
      expiration: new Date("2026-04-01T00:00:00Z"),
      statusId: 200,
      creator: "user_test",
    });
    publicElectionId = publicElection.id;
    const participationItem = await Item.create({
      id: "item_participation",
      name: "Participation Option",
      description: "Tracked item",
      url: "http://example.com/participation",
      creator: "user_test",
    });
    const participationList = await List.create({
      id: "list_participation",
      name: "Participation List",
      description: "List for participation summary",
      creator: "user_test",
    });
    await ListItem.create({
      id: "listitem_participation",
      listId: participationList.id,
      itemId: participationItem.id,
      creator: "user_test",
    });
    const participationElection = await Election.create({
      id: "election_participation",
      name: "Participation Poll",
      description: "Election with audience and vote progress",
      listId: participationList.id,
      groupId: "group_participation",
      workgroupId: "workgroup_test",
      expiration: new Date("2026-04-10T00:00:00Z"),
      statusId: 201,
      creator: "user_test",
    });
    participationElectionId = participationElection.id;
    await Vote.bulkCreate([
      {
        id: "vote_participation_user_test",
        electionId: participationElection.id,
        userId: "user_test",
        itemId: participationItem.id,
        statusId: 301,
        creator: "user_test",
      },
      {
        id: "vote_participation_user_sender",
        electionId: participationElection.id,
        userId: "user_sender",
        itemId: participationItem.id,
        statusId: 300,
        creator: "user_test",
      },
      {
        id: "vote_participation_user_password",
        electionId: participationElection.id,
        userId: "user_password",
        itemId: participationItem.id,
        statusId: 300,
        creator: "user_test",
      },
    ]);

    await Image.create({
      id: "image_transfer",
      name: "Transfer Image",
      description: "Owned image for transfer",
      creator: "user_source_owner",
    });
    await Item.create({
      id: "item_transfer",
      name: "Transfer Item",
      description: "Owned item for transfer",
      imageId: "image_transfer",
      creator: "user_source_owner",
    });
    await List.create({
      id: "list_transfer",
      name: "Transfer List",
      description: "Owned list for transfer",
      creator: "user_source_owner",
    });
    await ListItem.create({
      id: "listitem_transfer",
      listId: "list_transfer",
      itemId: "item_transfer",
      creator: "user_source_owner",
    });
    await Election.create({
      id: "election_transfer",
      name: "Transfer Election",
      description: "Owned election for transfer",
      listId: "list_transfer",
      expiration: new Date("2026-04-05T00:00:00Z"),
      creator: "user_source_owner",
    });
    await PublicPollInvite.create({
      id: "ppinvite_transfer",
      electionId: "election_transfer",
      creatorUserId: "user_source_owner",
      recipientEmail: "linked.transfer@example.com",
      recipientEmailHash: "linked-transfer-hash",
      inviteToken: "linked-transfer-token",
      status: "pending",
      creator: "user_source_owner",
    });
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

  addTest("list users can be narrowed by organizationId", async () => {
    const res = await request(server, "GET", "/user?organizationId=org_filter");
    assert.strictEqual(res.status, 200);
    const users = res.body?.data?.users || [];
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0].id, "user_filter_org");
    assert.strictEqual(users[0].organizationId, "org_filter");
  });

  addTest("list workgroups can be narrowed by organizationId", async () => {
    const res = await request(server, "GET", "/workgroup?organizationId=org_filter");
    assert.strictEqual(res.status, 200);
    const workgroups = res.body?.data?.workgroups || [];
    assert.strictEqual(workgroups.length, 1);
    assert.strictEqual(workgroups[0].id, "workgroup_filter");
    assert.strictEqual(workgroups[0].organizationId, "org_filter");
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
    assert.strictEqual(res.body.data.invite.status, "pending");
    assert.ok(res.body.data.invite.expiresAt);
    pendingInviteToken = res.body.data.invite.token;

    const audit = await AuthAudit.findOne({
      where: { eventType: "organization_invite_create", inviteId: res.body.data.invite.id },
    });
    assert.ok(audit);
    assert.strictEqual(audit.outcome, "success");
  });

  addTest("public invite lookup returns organization context", async () => {
    const res = await request(server, "GET", `/login/invite/${pendingInviteToken}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.invite.organizationId, "org_test");
    assert.strictEqual(res.body.data.invite.organizationName, "Test Organization");
  });

  addTest("organization invite list includes active pending invites", async () => {
    const res = await request(server, "GET", "/organization/org_test/invite?status=pending");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data.invites));
    assert.ok(res.body.data.invites.some((invite) => invite.token === pendingInviteToken));
  });

  addTest("organization invite resend regenerates token", async () => {
    const invite = await OrganizationInvite.findOne({
      where: { token: pendingInviteToken },
    });
    const res = await request(
      server,
      "POST",
      `/organization/org_test/invite/${invite.id}/resend`
    );
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.body.data.invite.token, pendingInviteToken);
    pendingInviteToken = res.body.data.invite.token;
  });

  addTest("authenticated user can accept matching organization invite", async () => {
    const invite = await OrganizationInvite.create({
      id: "orginvite_accept_existing",
      organizationId: "org_test",
      email: "test@example.com",
      token: "orginvite-accept-existing-token",
      invitedByUserId: "user_test",
      creator: "user_test",
    });

    const acceptRes = await request(
      server,
      "POST",
      `/login/invite/${invite.token}/accept`
    );
    assert.strictEqual(acceptRes.status, 200);
    assert.strictEqual(acceptRes.body.data.userId, "user_test");
    assert.strictEqual(acceptRes.body.data.organizationId, "org_test");
    assert.ok(acceptRes.body.data.authToken);

    const acceptedInvite = await OrganizationInvite.findByPk(invite.id);
    assert.ok(acceptedInvite.acceptedAt);
    assert.strictEqual(acceptedInvite.acceptedByUserId, "user_test");
  });

  addTest("authenticated user can decline matching organization invite", async () => {
    const invite = await OrganizationInvite.create({
      id: "orginvite_decline_existing",
      organizationId: "org_test",
      email: "test@example.com",
      token: "orginvite-decline-existing-token",
      invitedByUserId: "user_test",
      creator: "user_test",
    });

    const declineRes = await request(
      server,
      "POST",
      `/login/invite/${invite.token}/decline`
    );
    assert.strictEqual(declineRes.status, 200);
    assert.strictEqual(declineRes.body.data.status, "declined");

    const declinedInvite = await OrganizationInvite.findByPk(invite.id);
    assert.ok(declinedInvite.declinedAt);
    assert.strictEqual(declinedInvite.declinedByUserId, "user_test");
  });

  addTest("organization membership summary returns members and workgroups", async () => {
    const res = await request(server, "GET", "/organization/org_test/membership");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.organization.id, "org_test");
    assert.ok(Array.isArray(res.body.data.membership.members));
    assert.ok(Array.isArray(res.body.data.membership.workgroups));
    assert.ok(
      res.body.data.membership.members.some((member) => member.id === "user_test")
    );
    assert.ok(
      res.body.data.membership.workgroups.some((workgroup) => workgroup.id === "workgroup_test")
    );
  });

  addTest("election participation summary exposes audience and progress counts", async () => {
    const res = await request(server, "GET", `/election/${participationElectionId}/participation`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.election.id, participationElectionId);
    assert.strictEqual(res.body.data.audience.group.id, "group_participation");
    assert.strictEqual(res.body.data.audience.expectedParticipants, 3);
    assert.strictEqual(res.body.data.participation.expectedParticipants, 3);
    assert.strictEqual(res.body.data.participation.completedCount, 1);
    assert.strictEqual(res.body.data.participation.notStartedCount, 2);
    assert.strictEqual(res.body.data.participation.inProgressCount, 0);
    assert.strictEqual(res.body.data.participation.followUpCount, 2);
    assert.strictEqual(res.body.data.participation.castVotes, 1);
    assert.strictEqual(res.body.data.participation.pendingVotes, 2);
    assert.ok(
      Array.isArray(res.body.data.audience.participants) &&
        res.body.data.audience.participants.some(
          (participant) => participant.id === "user_test" && participant.state === "completed"
        )
    );
  });

  addTest("social login consumes pending org invite for first-time user", async () => {
    const res = await request(server, "POST", "/login/social", {
      provider: "google",
      subject: "google-subject-1",
      email: "social.invited@example.com",
      firstName: "Jane",
      lastName: "Doe",
      inviteToken: pendingInviteToken,
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

  addTest("social login rejects invite token when Google email does not match", async () => {
    const mismatchInviteRes = await request(server, "POST", "/organization/org_test/invite", {
      email: "other.person@example.com",
    });
    const res = await request(server, "POST", "/login/social", {
      provider: "google",
      subject: "google-subject-mismatch",
      email: "wrong.person@example.com",
      firstName: "Wrong",
      lastName: "Person",
      inviteToken: mismatchInviteRes.body.data.invite.token,
    });
    assert.strictEqual(res.status, 421);
    assert.strictEqual(res.body.message, "Invite email does not match Google account");
  });

  addTest("social login requires post-auth confirmation before linking existing password account", async () => {
    const res = await request(server, "POST", "/login/social", {
      provider: "google",
      subject: "google-subject-password-link",
      email: "password.link@example.com",
      firstName: "Pat",
      lastName: "Password",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.linkRequired, true);
    assert.ok(res.body.data.linkToken);
    assert.strictEqual(res.body.data.authToken, undefined);

    const social = await SocialIdentity.findOne({
      where: { provider: "google", subject: "google-subject-password-link" },
    });
    assert.strictEqual(social, null);

    const audit = await AuthAudit.findOne({
      where: {
        eventType: "social_link_confirmation",
        outcome: "pending",
        targetUserId: "user_password",
      },
      order: [["createdAt", "DESC"]],
    });
    assert.ok(audit);
  });

  addTest("social link confirmation links to existing password account and returns session", async () => {
    const initialRes = await request(server, "POST", "/login/social", {
      provider: "google",
      subject: "google-subject-password-link-confirm",
      email: "password.link@example.com",
      firstName: "Pat",
      lastName: "Password",
    });
    assert.strictEqual(initialRes.status, 200);
    assert.strictEqual(initialRes.body.data.linkRequired, true);

    const confirmRes = await request(server, "POST", "/login/social/link", {
      linkToken: initialRes.body.data.linkToken,
    });
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.data.userId, "user_password");
    assert.ok(confirmRes.body.data.authToken);
    assert.ok(confirmRes.body.data.refreshToken);

    const social = await SocialIdentity.findOne({
      where: { provider: "google", subject: "google-subject-password-link-confirm" },
    });
    assert.ok(social);
    assert.strictEqual(social.userId, "user_password");

    const audit = await AuthAudit.findOne({
      where: {
        eventType: "social_link_confirmation",
        outcome: "success",
        targetUserId: "user_password",
      },
      order: [["createdAt", "DESC"]],
    });
    assert.ok(audit);
  });

  addTest("social login blocks automatic linking for existing non-password account", async () => {
    const res = await request(server, "POST", "/login/social", {
      provider: "google",
      subject: "google-subject-social-only",
      email: "social.only@example.com",
      firstName: "Sam",
      lastName: "Social",
    });
    assert.strictEqual(res.status, 421);
    assert.strictEqual(res.body.message, "Existing account requires manual support review");

    const audit = await AuthAudit.findOne({
      where: {
        eventType: "social_sign_in",
        outcome: "blocked",
        targetUserId: "user_social_only",
      },
      order: [["createdAt", "DESC"]],
    });
    assert.ok(audit);
  });

  addTest("user sign-in methods expose password and linked providers", async () => {
    const res = await request(server, "GET", "/user/user_password/signin-method");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.methods.passwordEnabled, true);
    assert.ok(Array.isArray(res.body.data.methods.linkedProviders));
    assert.ok(
      res.body.data.methods.linkedProviders.some((method) => method.provider === "google")
    );
  });

  addTest("organization invite conflict returns support diagnostics", async () => {
    const res = await request(server, "POST", "/organization/org_test/invite", {
      email: "social.only@example.com",
    });
    assert.strictEqual(res.status, 421);
    assert.strictEqual(res.body.message, "User already belongs to this organization");

    const otherOrg = await Organization.create({
      id: "org_other",
      name: "Other Organization",
      active: true,
      creator: "user_test",
    });
    await User.create({
      id: "user_other_org",
      firstName: "Other",
      lastName: "Org",
      alias: "otherorg",
      email: "other.org@example.com",
      organizationId: otherOrg.id,
      creator: "user_test",
      active: true,
      admin: false,
      auth: await bcrypt.hash("password123", 12),
    });

    const conflictRes = await request(server, "POST", "/organization/org_test/invite", {
      email: "other.org@example.com",
    });
    assert.strictEqual(conflictRes.status, 421);
    assert.strictEqual(conflictRes.body.data.conflict.organizationId, "org_other");
    assert.strictEqual(conflictRes.body.data.conflict.organizationName, "Other Organization");
  });

  addTest("user and organization audit feeds return recent events", async () => {
    const userAuditRes = await request(server, "GET", "/user/user_password/authaudit");
    assert.strictEqual(userAuditRes.status, 200);
    assert.ok(Array.isArray(userAuditRes.body.data.audits));
    assert.ok(userAuditRes.body.data.audits.length >= 1);

    const orgAuditRes = await request(server, "GET", "/organization/org_test/authaudit");
    assert.strictEqual(orgAuditRes.status, 200);
    assert.ok(Array.isArray(orgAuditRes.body.data.audits));
    assert.ok(orgAuditRes.body.data.audits.some((audit) => audit.eventType));
  });

  addTest("support auth overview and feed return scoped observability data", async () => {
    await AuthAudit.create({
      id: "audit_support_success",
      eventType: "social_login",
      outcome: "success",
      actorUserId: "user_test",
      targetUserId: "user_test",
      organizationId: "org_test",
      provider: "google",
      email: "test@example.com",
      message: "Google login succeeded",
      creator: "user_test",
    });
    await AuthAudit.create({
      id: "audit_support_failure",
      eventType: "organization_invite_create",
      outcome: "failure",
      actorUserId: "user_test",
      organizationId: "org_test",
      email: "blocked@example.com",
      message: "Invite blocked",
      creator: "user_test",
    });

    const overviewRes = await request(
      server,
      "GET",
      "/support/auth/overview?days=7&organizationId=org_test"
    );
    assert.strictEqual(overviewRes.status, 200);
    assert.strictEqual(overviewRes.body.data.organizationId, "org_test");
    assert.ok(overviewRes.body.data.totals.totalEvents >= 2);
    assert.ok(Array.isArray(overviewRes.body.data.recentFailures));

    const feedRes = await request(
      server,
      "GET",
      "/support/auth/audit?organizationId=org_test&outcome=failure&items=10"
    );
    assert.strictEqual(feedRes.status, 200);
    assert.ok(Array.isArray(feedRes.body.data.audits));
    assert.ok(feedRes.body.data.audits.some((audit) => audit.outcome === "failure"));
  });

  addTest("support public poll overview and feed return scoped abuse data", async () => {
    await AbuseAudit.create({
      id: "abuse_support_report",
      actorType: "guest",
      electionId: publicElectionId,
      eventType: "public_poll_reported",
      outcome: "success",
      message: "Guest reported offensive content",
      metadata: JSON.stringify({ reason: "offensive" }),
      creator: "system",
    });
    await AbuseAudit.create({
      id: "abuse_support_blocked",
      actorType: "user",
      actorUserId: "user_test",
      electionId: publicElectionId,
      eventType: "public_poll_invite_blocked_trust",
      outcome: "blocked",
      message: "Invite blocked for trust tier",
      creator: "user_test",
    });

    const overviewRes = await request(
      server,
      "GET",
      `/support/publicpoll/overview?days=7&organizationId=org_test&electionId=${publicElectionId}`
    );
    assert.strictEqual(overviewRes.status, 200);
    assert.strictEqual(overviewRes.body.data.organizationId, "org_test");
    assert.strictEqual(overviewRes.body.data.totals.reportCount, 1);
    assert.strictEqual(overviewRes.body.data.totals.blockedCount, 1);
    assert.ok(Array.isArray(overviewRes.body.data.recentIncidents));
    assert.strictEqual(overviewRes.body.data.recentIncidents[0].election.id, publicElectionId);
    assert.strictEqual(
      overviewRes.body.data.recentIncidents[0].workgroup.organizationId,
      "org_test"
    );

    const feedRes = await request(
      server,
      "GET",
      `/support/publicpoll/audit?organizationId=org_test&eventType=public_poll_reported&items=10`
    );
    assert.strictEqual(feedRes.status, 200);
    assert.ok(Array.isArray(feedRes.body.data.audits));
    assert.ok(
      feedRes.body.data.audits.some(
        (audit) =>
          audit.eventType === "public_poll_reported" &&
          audit.election?.id === publicElectionId
      )
    );
  });

  addTest("support operator aliases expose remediations under support namespace", async () => {
    const trustRes = await request(server, "GET", "/support/elections/public/trust");
    assert.strictEqual(trustRes.status, 200);
    assert.ok(trustRes.body.data.trustProfile);

    const methodsRes = await request(server, "GET", "/support/users/user_password/signin-method");
    assert.strictEqual(methodsRes.status, 200);
    assert.ok(methodsRes.body.data.methods);

    const auditRes = await request(
      server,
      "GET",
      "/support/users/user_password/authaudit?items=5"
    );
    assert.strictEqual(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body.data.audits));

    const tokenRes = await request(server, "POST", "/support/session/testtoken", {
      userId: "user_test",
      expiresInMinutes: 15,
    });
    assert.strictEqual(tokenRes.status, 200);
    assert.ok(tokenRes.body.data.authToken);

    const revokeRes = await request(server, "POST", "/support/session/testtoken/revoke", {
      tokenId: tokenRes.body.data.tokenId,
    });
    assert.strictEqual(revokeRes.status, 200);
    assert.ok(revokeRes.body.data.revokedAt);
  });

  addTest("organization invite revoke removes pending invite and invalidates lookup", async () => {
    const inviteRes = await request(server, "POST", "/organization/org_test/invite", {
      email: "revoke.person@example.com",
    });
    const inviteId = inviteRes.body.data.invite.id;
    const token = inviteRes.body.data.invite.token;

    const revokeRes = await request(
      server,
      "DELETE",
      `/organization/org_test/invite/${inviteId}`
    );
    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeRes.body.data.invite.status, "revoked");

    const lookupRes = await request(server, "GET", `/login/invite/${token}`);
    assert.strictEqual(lookupRes.status, 404);

    const historyRes = await request(server, "GET", "/organization/org_test/invite?status=revoked");
    assert.strictEqual(historyRes.status, 200);
    assert.ok(historyRes.body.data.invites.some((invite) => invite.id === inviteId));

    const audit = await AuthAudit.findOne({
      where: { eventType: "organization_invite_revoke", inviteId },
    });
    assert.ok(audit);
    assert.strictEqual(audit.outcome, "success");
  });

  addTest("organization invite history reports expired invites", async () => {
    const inviteRes = await request(server, "POST", "/organization/org_test/invite", {
      email: "expired.person@example.com",
      expiresAt: "2026-03-01T00:00:00.000Z",
    });
    assert.strictEqual(inviteRes.status, 200);
    assert.strictEqual(inviteRes.body.data.invite.status, "expired");

    const historyRes = await request(server, "GET", "/organization/org_test/invite?status=expired");
    assert.strictEqual(historyRes.status, 200);
    assert.ok(
      historyRes.body.data.invites.some((invite) => invite.email === "expired.person@example.com")
    );
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

  addTest("public poll trust endpoint exposes trust-gated invite limits", async () => {
    const res = await request(server, "GET", "/election/public/trust");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.trustProfile.trustTier, "basic");
    assert.strictEqual(res.body.data.trustProfile.canSendExternalInvites, true);
  });

  addTest("election owner can enable public poll mode", async () => {
    const res = await request(server, "POST", `/election/${publicElectionId}/public/enable`, {
      publicAccessMode: "link_vote",
      guestVotingEnabled: true,
      allowPlatformInvites: true,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.publicElection.publicAccessMode, "link_vote");
    assert.strictEqual(res.body.data.publicElection.guestVotingEnabled, true);
    assert.strictEqual(res.body.data.publicElection.allowPlatformInvites, true);
    assert.ok(res.body.data.publicElection.publicToken);
    publicElectionToken = res.body.data.publicElection.publicToken;
  });

  addTest("public poll can be viewed and voted through guest session", async () => {
    const viewRes = await request(server, "GET", `/public/election/${publicElectionToken}`);
    assert.strictEqual(viewRes.status, 200);
    assert.strictEqual(viewRes.body.data.election.id, publicElectionId);
    assert.ok(Array.isArray(viewRes.body.data.election.list.items));
    assert.strictEqual(viewRes.body.data.election.list.items[0].id, publicListItemId);

    const sessionRes = await request(server, "POST", `/public/election/${publicElectionToken}/session`, {
      displayName: "Guest User",
    });
    assert.strictEqual(sessionRes.status, 200);
    assert.ok(sessionRes.body.data.sessionToken);

    const voteRes = await request(server, "POST", `/public/election/${publicElectionToken}/vote`, {
      sessionToken: sessionRes.body.data.sessionToken,
      itemId: publicListItemId,
      decision: "yes",
    });
    assert.strictEqual(voteRes.status, 200);
    assert.strictEqual(voteRes.body.data.vote.itemId, publicListItemId);
    assert.strictEqual(voteRes.body.data.vote.decision, "yes");
  });

  addTest("trusted election owner can send public poll invite", async () => {
    const res = await request(server, "POST", `/election/${publicElectionId}/invite`, {
      email: "public.invited@example.com",
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data.results));
    assert.strictEqual(res.body.data.results[0].status, 200);

    const statsRes = await request(server, "GET", `/election/${publicElectionId}/public/stats`);
    assert.strictEqual(statsRes.status, 200);
    assert.strictEqual(statsRes.body.data.statistics.inviteCount, 1);
    assert.strictEqual(statsRes.body.data.statistics.participantCount, 1);
    assert.strictEqual(statsRes.body.data.statistics.voteCount, 1);
  });

  addTest("ownership transfer preview reports direct and linked objects", async () => {
    const res = await request(
      server,
      "GET",
      "/user/user_source_owner/ownership/preview?ownerId=user_target_owner&includeLinked=true&resources=lists,elections"
    );
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.data.transfer.resources, ["lists", "elections"]);
    assert.strictEqual(res.body.data.transfer.direct.lists, 1);
    assert.strictEqual(res.body.data.transfer.direct.elections, 1);
    assert.strictEqual(res.body.data.transfer.linked.listEntries, 1);
    assert.strictEqual(res.body.data.transfer.linked.linkedItems, 1);
    assert.strictEqual(res.body.data.transfer.linked.linkedImages, 1);
    assert.strictEqual(res.body.data.transfer.linked.publicPollInvites, 1);
  });

  addTest("ownership transfer applies direct and linked owner changes", async () => {
    const res = await request(server, "POST", "/user/user_source_owner/ownership/transfer", {
      ownerId: "user_target_owner",
      includeLinked: true,
      resources: ["lists", "elections"],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.transfer.changed.lists, 1);
    assert.strictEqual(res.body.data.transfer.changed.elections, 1);
    assert.strictEqual(res.body.data.transfer.changed.listEntries, 1);
    assert.strictEqual(res.body.data.transfer.changed.linkedItems, 1);
    assert.strictEqual(res.body.data.transfer.changed.linkedImages, 1);
    assert.strictEqual(res.body.data.transfer.changed.publicPollInvites, 1);

    const [list, listItem, item, image, election, invite] = await Promise.all([
      List.findByPk("list_transfer"),
      ListItem.findByPk("listitem_transfer"),
      Item.findByPk("item_transfer"),
      Image.findByPk("image_transfer"),
      Election.findByPk("election_transfer"),
      PublicPollInvite.findByPk("ppinvite_transfer"),
    ]);
    assert.strictEqual(list.creator, "user_target_owner");
    assert.strictEqual(listItem.creator, "user_target_owner");
    assert.strictEqual(item.creator, "user_target_owner");
    assert.strictEqual(image.creator, "user_target_owner");
    assert.strictEqual(election.creator, "user_target_owner");
    assert.strictEqual(invite.creator, "user_target_owner");
    assert.strictEqual(invite.creatorUserId, "user_target_owner");
  });

  addTest("teardown server", async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await database.close();
  });
};

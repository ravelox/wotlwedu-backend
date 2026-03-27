const module_id = "update-0016";
const module_comment = "Add public poll access, trust, invite, suppression, and abuse audit tables";
const module_target_database_version = 17;

let _queryInterface = null;
let _sequelize = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function init(queryInterface, sequelize) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  _queryInterface = queryInterface;
  _sequelize = sequelize || { Sequelize: require("sequelize") };
  return { status: 0, message: "OK" };
}

function cleanup() {
  return { status: 0, message: "OK" };
}

async function hasColumn(tableName, columnName) {
  try {
    const table = await _queryInterface.describeTable(tableName);
    return !!table[columnName];
  } catch {
    return false;
  }
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    const elections = await queryInterface.describeTable("elections");
    await queryInterface.describeTable("publicpollparticipants");
    await queryInterface.describeTable("publicpollvotes");
    await queryInterface.describeTable("publicpollinvites");
    await queryInterface.describeTable("contactsuppressions");
    await queryInterface.describeTable("trustprofiles");
    await queryInterface.describeTable("abuseaudits");
    return {
      status: 0,
      applied:
        !!elections.publicAccessMode &&
        !!elections.publicToken &&
        !!elections.allowPlatformInvites,
    };
  } catch {
    return { status: 0, applied: false };
  }
}

async function ensureColumn(tableName, columnName, spec) {
  const exists = await hasColumn(tableName, columnName);
  if (!exists) {
    await _queryInterface.addColumn(tableName, columnName, spec);
  }
}

async function ensureTable(tableName, definition, indexes = []) {
  try {
    await _queryInterface.describeTable(tableName);
  } catch {
    await _queryInterface.createTable(tableName, definition);
  }
  for (const index of indexes) {
    try {
      await _queryInterface.addIndex(tableName, index.fields, index.options || {});
    } catch {
      // Ignore duplicate index creation attempts on partially migrated databases.
    }
  }
}

async function apply() {
  if (!_queryInterface || !_sequelize) {
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };
  }

  try {
    await ensureColumn("elections", "publicAccessMode", {
      type: _sequelize.Sequelize.STRING,
      allowNull: false,
      defaultValue: "private",
    });
    await ensureColumn("elections", "publicToken", {
      type: _sequelize.Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await ensureColumn("elections", "publicEnabledAt", {
      type: _sequelize.Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await ensureColumn("elections", "publicDisabledAt", {
      type: _sequelize.Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await ensureColumn("elections", "guestVotingEnabled", {
      type: _sequelize.Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await ensureColumn("elections", "guestVoteLimitPerPoll", {
      type: _sequelize.Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1000,
    });
    await ensureColumn("elections", "guestVoteLimitPerIpPerDay", {
      type: _sequelize.Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 100,
    });
    await ensureColumn("elections", "allowPlatformInvites", {
      type: _sequelize.Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await ensureColumn("elections", "invitePolicy", {
      type: _sequelize.Sequelize.STRING,
      allowNull: false,
      defaultValue: "none",
    });
    await ensureColumn("elections", "abuseStatus", {
      type: _sequelize.Sequelize.STRING,
      allowNull: false,
      defaultValue: "normal",
    });
    try {
      await _queryInterface.addIndex("elections", ["publicToken"]);
    } catch {
      // Ignore duplicate index creation attempts on partially migrated databases.
    }

    await ensureTable(
      "publicpollparticipants",
      {
        id: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        electionId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        sessionKeyHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        emailHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        displayName: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        consentState: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "anonymous",
        },
        lastSeenAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        creator: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
        },
        createdAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      [
        { fields: ["electionId"] },
        { fields: ["sessionKeyHash"] },
        { fields: ["electionId", "sessionKeyHash"], options: { unique: true } },
      ]
    );

    await ensureTable(
      "publicpollvotes",
      {
        id: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        electionId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        itemId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        participantId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        decision: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "vote",
        },
        sourceIpHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        userAgentHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        creator: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
        },
        createdAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      [
        { fields: ["electionId"] },
        { fields: ["participantId"] },
        { fields: ["participantId", "itemId"], options: { unique: true } },
      ]
    );

    await ensureTable(
      "publicpollinvites",
      {
        id: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        electionId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        creatorUserId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        recipientEmail: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        recipientEmailHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        inviteToken: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        status: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "pending",
        },
        acceptedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        acceptedByParticipantId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        revokedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        lastSentAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        sendCount: {
          type: _sequelize.Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        creator: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
        },
        createdAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      [
        { fields: ["electionId"] },
        { fields: ["creatorUserId"] },
        { fields: ["recipientEmailHash"] },
        { fields: ["inviteToken"], options: { unique: true } },
        { fields: ["electionId", "recipientEmailHash"], options: { unique: true } },
      ]
    );

    await ensureTable(
      "contactsuppressions",
      {
        id: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        channel: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "email",
        },
        recipient: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        recipientHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        reason: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "unsubscribe",
        },
        creator: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
        },
        createdAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      [{ fields: ["channel", "recipientHash"], options: { unique: true } }]
    );

    await ensureTable(
      "trustprofiles",
      {
        userId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        trustTier: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "new",
        },
        emailVerified: {
          type: _sequelize.Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        canSendExternalInvites: {
          type: _sequelize.Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        inviteQuotaDaily: {
          type: _sequelize.Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        inviteQuotaHourly: {
          type: _sequelize.Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        maxRecipientsPerPoll: {
          type: _sequelize.Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        creator: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
        },
        createdAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      [{ fields: ["trustTier"] }, { fields: ["canSendExternalInvites"] }]
    );

    await ensureTable(
      "abuseaudits",
      {
        id: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        actorType: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
          defaultValue: "system",
        },
        actorUserId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        electionId: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        eventType: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        outcome: {
          type: _sequelize.Sequelize.STRING,
          allowNull: false,
        },
        ipHash: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        message: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
          defaultValue: null,
        },
        metadata: {
          type: _sequelize.Sequelize.TEXT,
          allowNull: true,
          defaultValue: null,
        },
        creator: {
          type: _sequelize.Sequelize.STRING,
          allowNull: true,
        },
        createdAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: _sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: _sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      },
      [
        { fields: ["actorUserId"] },
        { fields: ["electionId"] },
        { fields: ["eventType"] },
        { fields: ["outcome"] },
        { fields: ["createdAt"] },
      ]
    );
  } catch (err) {
    return { status: -1, message: err };
  }

  return { status: 0, message: "OK" };
}

function remove() {
  return { status: 0, message: "OK" };
}

function dryRun() {
  this.apply(false);
  this.remove(false);
}

module.exports.init = init;
module.exports.cleanup = cleanup;
module.exports.isApplied = isApplied;
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;

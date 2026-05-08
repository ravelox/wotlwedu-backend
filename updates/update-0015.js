const module_id = "update-0015";
const module_comment = "Add auth audit table";
const module_target_database_version = 16;

let _queryInterface = null;
let _sequelize = null;

module.exports.id = module_id;
module.exports.comment = module_comment;
module.exports.title = module_comment;
module.exports.targetDatabaseVersion = module_target_database_version;

function init(queryInterface, sequelize) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  _queryInterface = queryInterface;
  _sequelize = sequelize;
  return { status: 0, message: "OK" };
}

function cleanup() {
  return { status: 0, message: "OK" };
}

async function isApplied(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  try {
    await queryInterface.describeTable("authaudits");
    return { status: 0, applied: true };
  } catch {
    return { status: 0, applied: false };
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
    await _queryInterface.createTable("authaudits", {
      id: {
        type: _sequelize.Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      eventType: {
        type: _sequelize.Sequelize.STRING,
        allowNull: false,
      },
      outcome: {
        type: _sequelize.Sequelize.STRING,
        allowNull: false,
      },
      actorUserId: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      targetUserId: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      organizationId: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      inviteId: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      provider: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      email: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      ipAddress: {
        type: _sequelize.Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      userAgent: {
        type: _sequelize.Sequelize.TEXT,
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
    });

    await _queryInterface.addIndex("authaudits", ["eventType"]);
    await _queryInterface.addIndex("authaudits", ["outcome"]);
    await _queryInterface.addIndex("authaudits", ["actorUserId"]);
    await _queryInterface.addIndex("authaudits", ["targetUserId"]);
    await _queryInterface.addIndex("authaudits", ["organizationId"]);
    await _queryInterface.addIndex("authaudits", ["inviteId"]);
    await _queryInterface.addIndex("authaudits", ["provider"]);
    await _queryInterface.addIndex("authaudits", ["email"]);
    await _queryInterface.addIndex("authaudits", ["createdAt"]);
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

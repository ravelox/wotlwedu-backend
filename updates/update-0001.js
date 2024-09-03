const module_id = "update-0001";
const module_comment = "Create System and Root Users";

const UUID = require("../util/mini-uuid");

const User = require("../model/user");
const Assoc = require("../model/associations");
Assoc.setup();

const rootUser = {
  id: UUID("user"),
  firstName: "Root",
  lastName: "User",
  alias: "root",
  email: "root@localhost.localdomain",
  auth: "$2y$12$T54UV8HFNyErzu5KrZG/U.nZYmhGFQx0knV8FsYE3IFd/xzAFEq86",
  active: true,
  verified: true,
  admin: true,
};

const systemUser = {
  id: "system",
  firstName: "Wotlwedu",
  lastName: "System",
  alias: "system",
  email: "noreply@wotlwedu.net",
  active: false,
  verified: false,
  admin: false,
  protected: true,
};

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log("Initialising module [" + module_id + "]");
  _queryInterface = queryInterface;

  return { status: 0, message: "OK" };
}

function cleanup() {
  console.log("Cleaning module [" + module_id + "]");
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  try {
    const foundUser = await User.findOne({where: {id: "system"}})
    if( !foundUser ) await User.create(systemUser);
  } catch (err) {
    return { status: -1, message: err };
  }

  try {
    const foundUser = await User.findOne({where: {alias: "root"}})
    if(! foundUser) await User.create(rootUser);
  } catch (err) {
    return { status: -1, message: err };
  }

  return { status: 0, message: "OK" };
}

function remove(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  return { status: 0, message: "OK" };
}

function dryRun() {
  this.apply(false);
  this.remove(false);
}

module.exports.init = init;
module.exports.cleanup = cleanup;
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;

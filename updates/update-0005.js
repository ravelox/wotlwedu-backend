const module_id = "update-0005";
const module_comment = "Add SocketInfo table";

const SocketInfo = require("../model/socketinfo");

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
    await SocketInfo.sync({force: true})
  } catch (err) {
    console.log( err )
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

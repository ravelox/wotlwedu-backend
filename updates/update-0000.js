const module_id = "update-0000";
const module_comment = "Add Metadata table";

const Metadata = require("../model/metadata");

const toBool = require("../util/tobool");

let _queryInterface = null;
let _allowSync = false;

module.exports.id = module_id;
module.exports.comment = module_comment;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log("Initialising module [" + module_id + "]");
  _queryInterface = queryInterface;
  _allowSync = toBool(process.env.WOTLWEDU_SYNC_DATABASE) || false;
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
    await Metadata.sync()
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

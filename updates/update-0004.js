const module_id = "update-0004";
const module_comment = "Add intial statuses";

const Util = require("util");

const Config = require("../config/wotlwedu");
const database = require("../util/database");

const Status = require("../model/status");

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;

const statusNames = [
  { id: 0, object: "all", name: "Pending" },
  { id: 1, object: "user", name: "Friend" },
  { id: 2, object: "user", name: "Blocked" },
  { id: 10, object: "election", name: "Not Started" },
  { id: 11, object: "election", name: "In Progress" },
  { id: 12, object: "election", name: "Stopped" },
  { id: 13, object: "election", name: "Ended" },
  { id: 20, object: "vote", name: "Yes" },
  { id: 21, object: "vote", name: "No" },
  { id: 22, object: "vote", name: "Maybe" },
  { id: 100, object: "notification", name: "Unread" },
  { id: 101, object: "notification", name: "Read" },
  { id: 102, object: "notification", name: "Archived" },
  { id: 103, object: "notification", name: "Friend Request" },
  { id: 104, object: "notification", name: "Election Start" },
  { id: 105, object: "notification", name: "Election End" },
  { id: 106, object: "notification", name: "Election Expired" },
  { id: 107, object: "notification", name: "Share Image" },
  { id: 108, object: "notification", name: "Share Item" },
  { id: 109, object: "notification", name: "Share List" },
];

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log(module_id + ": Initialising");

  _queryInterface = queryInterface;

  return { status: 0, message: "OK" };
}

function cleanup() {
  console.log(module_id + ": Cleaning");
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };
  for (s of statusNames) {
    s.creator = "system";
    try {
      const foundStatus = await Status.findOne({where: {id: s.id}});
      if( ! foundStatus ) await Status.create(s);
    } catch (err) {
      console.log(err);
    }
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

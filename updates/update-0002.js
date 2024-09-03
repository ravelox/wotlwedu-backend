const module_id = "update-0002";
const module_comment = "Add default capabilities";

const Util = require("util");

const Config = require("../config/wotlwedu");
const database = require("../util/database");

const Capability = require("../model/capability");

const UUID = require("../util/mini-uuid");

function genDefaultCaps() {
  let capNumber = 0;
  let caps = [];

  const datamodels = ["all"].concat(Object.keys(database.models));

  const operations = ["manage", "delete", "edit", "add", "view"];
  const usertypes = ["admin", "owner"];

  for (model of datamodels) {
    for (operation of operations) {
      for (usertype of usertypes) {
        caps.push({
          id: "capa_" + capNumber.toString().padStart(3, "0"),
          name: [model, operation, usertype].join("."),
        });
        capNumber = capNumber + 1;
      }
    }
  }
  return caps;
}

let _queryInterface = null;
let defaultCaps = [];

module.exports.id = module_id;
module.exports.comment = module_comment;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }
  console.log(module_id + ": Initialising");

  _queryInterface = queryInterface;
  defaultCaps = genDefaultCaps();

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
  for (cap of defaultCaps) {
    const cap_id = cap.id;
    const cap_name = cap.name;
    const c = new Capability({
      id: cap_id,
      name: cap_name,
      creator: "system",
    });

    const foundCap = await Capability.findOne({ where: { id: c.id } });
    if (!foundCap) {
      await c.save().catch((err) => console.log(err));
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

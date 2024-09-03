const module_id = "<YOUR ID HERE>";
const module_omment = "<YOUR COMMENT HERE>";

let _queryInterface = null;

module.exports.id = module_id;
module.exports.comment = module_comment;

function init(queryInterface) {
  if (!queryInterface) {
    return { status: -1, message: "No query interface supplied" };
  }

  console.log(module_id + ": Initialising");
  _queryInterface = queryInterface;

  return { status: 0, message: "OK" };
}

function cleanup() {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  console.log(module_id + ": Cleaning");

  return { status: 0, message: "OK" };
}

async function apply(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  console.log(module_id + ": Applying");

  return { status: 0, message: "OK" };
}

async function remove(update) {
  if (!_queryInterface)
    return {
      status: -1,
      message: "No query interface available. Call init() method first",
    };

  console.log(module_id + ": Removing");

  return { status: 0, message: "OK" };
}

function dryRun() {
  console.log(module_id + ": Dry Run");

  this.apply(false);
  this.remove(false);
}

module.exports.init = init;
module.exports.cleanup = cleanup;
module.exports.apply = apply;
module.exports.remove = remove;
module.exports.dryRun = dryRun;

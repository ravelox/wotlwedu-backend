const DBUpdate = require("../util/dbupdate");

DBUpdate.checkForUpdates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Database Updates: Failed");
    console.error(err);
    process.exit(1);
  });

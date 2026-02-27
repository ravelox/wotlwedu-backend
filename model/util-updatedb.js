// Update modules are written against Sequelize models/query interface.
// Force the update process to use the Sequelize adapter regardless of runtime DB adapter selection.
process.env.WOTLWEDU_FORCE_SEQUELIZE_FOR_UPDATES = "true";

const DBUpdate = require("../util/dbupdate");

DBUpdate.checkForUpdates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Database Updates: Failed");
    console.error(err);
    process.exit(1);
  });

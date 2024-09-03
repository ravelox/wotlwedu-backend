const FS = require("fs");
const Path = require("path");
const glob = require("node:fs/promises");

const Config = require("../config/wotlwedu");
const database = require("./database");

const Assoc = require("../model/associations");

const Metadata = require("../model/metadata");

const updateDirName = "updates";
const fileRegex = /update-\d+\.js/;

module.exports.checkForUpdates = async () => {
  const queryInterface = database.getQueryInterface();

  console.log("Database Updates: Checking");

  const fullUpdatePath = Path.join("..", updateDirName);
  const dir = FS.readdirSync(fullUpdatePath).sort();
  for await (const entry of dir) {
    // Only work on update js files matching the regex
    if (!entry.match(fileRegex)) {
      console.log("Database Updates: Skipping " + entry);
      continue;
    }

    const fullFileName = Path.join(fullUpdatePath, entry);
    const updateModule = require(fullFileName);

    let updateMetadata;

    // Check if this update is recorded as being applied
    const options = {};
    options.where = { name: updateModule.id };
    options.raw = true;
    updateMetadata = await Metadata.findOne(options);
    

    // Apply it if it hasn't
    if (!updateMetadata) {
      console.log(
        "Database Updates: Applying update [" + updateModule.id + "]"
      );

      updateModule.init(queryInterface);
      result = await updateModule.apply(true);

      console.log(result);

      // If an error occured, call the remove method to clean up
      if (result.status === -1) {
        console.log("Database Updates: Removing update");
        result = await updateModule.remove(true);
      } else {
        updateModule.cleanup();
        const updateDetails = new Metadata();
        updateDetails.name = updateModule.id;
        updateDetails.value = "applied";
        if (updateModule.comment) updateDetails.comment = updateModule.comment;
        await updateDetails.save();
        console.log("Database Updates: Update applied");
      }
    } else {
      console.log("Database Updates: Skipping " + updateModule.id);
    }
  }
  console.log("Database Updates: Done");
};

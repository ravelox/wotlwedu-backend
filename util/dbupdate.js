const FS = require("fs");
const Path = require("path");
const database = require("./database");
const Metadata = require("../model/metadata");
const Assoc = require("../model/associations");

const updateDirName = "updates";
const fileRegex = /^update-\d+\.js$/;

function getUpdateTitle(updateModule) {
  return updateModule.title || updateModule.comment || "Untitled update";
}

function getUpdateLabel(updateModule) {
  return updateModule.id + " - " + getUpdateTitle(updateModule);
}

async function upsertMetadata(metadataModel, name, value, comment = null) {
  const existing = await metadataModel.findByPk(name);
  if (existing) {
    existing.value = value;
    if (comment !== null && comment !== undefined) {
      existing.comment = comment;
    }
    await existing.save();
    return existing;
  }

  return metadataModel.create({
    name: name,
    value: value,
    comment: comment,
  });
}

module.exports.checkForUpdates = async (options = {}) => {
  // Ensure all models are loaded and associations are registered in this process.
  const metadataModel = options.metadataModel || Metadata;
  const associations = options.associations || Assoc;
  const databaseInstance = options.database || database;
  const logger = options.logger || console;
  associations.setup();

  const queryInterface = databaseInstance.getQueryInterface();

  logger.log("Database Updates: Checking");

  const fullUpdatePath = options.updatePath || Path.join(__dirname, "..", updateDirName);
  const dir = FS.readdirSync(fullUpdatePath).sort();

  // Bootstrap metadata tracking table if it does not yet exist.
  try {
    await metadataModel.sync();
  } catch (err) {
    logger.log("Database Updates: Failed to sync metadata table");
    throw err;
  }

  for await (const entry of dir) {
    // Only work on update js files matching the regex
    if (!fileRegex.test(entry)) {
      logger.log("Database Updates: Skipping " + entry);
      continue;
    }

    const fullFileName = Path.join(fullUpdatePath, entry);
    const updateModule = require(fullFileName);

    if (!updateModule.id) {
      throw new Error("Database Updates: Update module has no id: " + entry);
    }
    const updateLabel = getUpdateLabel(updateModule);
    const updateMetadata = await metadataModel.findByPk(updateModule.id);

    let physicallyApplied = false;
    if (typeof updateModule.isApplied === "function") {
      let physicalCheck;
      try {
        physicalCheck = await updateModule.isApplied(queryInterface);
      } catch (err) {
        physicalCheck = { status: -1, message: err };
      }

      // Physical checks are best-effort. If they fail (e.g. because a table does not
      // exist yet), treat as "not applied" and proceed to apply().
      if (physicalCheck && physicalCheck.status === -1) {
        logger.log(
          "Database Updates: Physical check errored for " +
            updateLabel +
            "; proceeding to apply"
        );
      }

      physicallyApplied =
        physicalCheck === true || (physicalCheck && physicalCheck.applied === true);
    }

    // If metadata says we've applied this update, verify that the change still exists.
    // If it doesn't, re-apply the update (updates are expected to be idempotent).
    if (updateMetadata && physicallyApplied) {
      logger.log("Database Updates: Skipping " + updateLabel);
      continue;
    }
    if (updateMetadata && !physicallyApplied && typeof updateModule.isApplied === "function") {
      logger.log(
        "Database Updates: Metadata present but physical check indicates not applied; reapplying [" +
          updateLabel +
          "]"
      );
    } else if (updateMetadata && typeof updateModule.isApplied !== "function") {
      logger.log("Database Updates: Skipping " + updateLabel);
      continue;
    }

    if (physicallyApplied) {
      logger.log(
        "Database Updates: Backfilling metadata for already-applied update [" +
          updateLabel +
          "]"
      );
      await upsertMetadata(metadataModel, updateModule.id, "applied", getUpdateTitle(updateModule));
      continue;
    }

    logger.log("Database Updates: Applying update [" + updateLabel + "]");

    let result;
    const initResult = updateModule.init(queryInterface);
    if (initResult && initResult.status === -1) {
      throw new Error(
        "Database Updates: Failed to initialise update " + updateLabel
      );
    }

    result = await updateModule.apply(true);

    // If an error occured, call the remove method to clean up
    if (result.status === -1) {
      logger.log("Database Updates: Removing update [" + updateLabel + "]");
      result = await updateModule.remove(true);
    } else {
      updateModule.cleanup();
      await upsertMetadata(metadataModel, updateModule.id, "applied", getUpdateTitle(updateModule));
      logger.log("Database Updates: Update applied [" + updateLabel + "]");
    }
  }
  logger.log("Database Updates: Done");
};

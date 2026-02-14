const FS = require("fs");
const Path = require("path");
const database = require("./database");
const Metadata = require("../model/metadata");
const Assoc = require("../model/associations");

const updateDirName = "updates";
const fileRegex = /^update-\d+\.js$/;

async function upsertMetadata(name, value, comment = null) {
  const existing = await Metadata.findByPk(name);
  if (existing) {
    existing.value = value;
    if (comment !== null && comment !== undefined) {
      existing.comment = comment;
    }
    await existing.save();
    return existing;
  }

  return Metadata.create({
    name: name,
    value: value,
    comment: comment,
  });
}

module.exports.checkForUpdates = async () => {
  // Ensure all models are loaded and associations are registered in this process.
  Assoc.setup();

  const queryInterface = database.getQueryInterface();

  console.log("Database Updates: Checking");

  const fullUpdatePath = Path.join(__dirname, "..", updateDirName);
  const dir = FS.readdirSync(fullUpdatePath).sort();

  // Bootstrap metadata tracking table if it does not yet exist.
  try {
    await Metadata.sync();
  } catch (err) {
    console.log("Database Updates: Failed to sync metadata table");
    throw err;
  }

  for await (const entry of dir) {
    // Only work on update js files matching the regex
    if (!fileRegex.test(entry)) {
      console.log("Database Updates: Skipping " + entry);
      continue;
    }

    const fullFileName = Path.join(fullUpdatePath, entry);
    const updateModule = require(fullFileName);

    if (!updateModule.id) {
      throw new Error("Database Updates: Update module has no id: " + entry);
    }
    const updateMetadata = await Metadata.findByPk(updateModule.id);

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
        console.log(
          "Database Updates: Physical check errored for " +
            updateModule.id +
            "; proceeding to apply"
        );
      }

      physicallyApplied =
        physicalCheck === true || (physicalCheck && physicalCheck.applied === true);
    }

    // If metadata says we've applied this update, verify that the change still exists.
    // If it doesn't, re-apply the update (updates are expected to be idempotent).
    if (updateMetadata && physicallyApplied) {
      console.log("Database Updates: Skipping " + updateModule.id);
      continue;
    }
    if (updateMetadata && !physicallyApplied && typeof updateModule.isApplied === "function") {
      console.log(
        "Database Updates: Metadata present but physical check indicates not applied; reapplying [" +
          updateModule.id +
          "]"
      );
    } else if (updateMetadata && typeof updateModule.isApplied !== "function") {
      console.log("Database Updates: Skipping " + updateModule.id);
      continue;
    }

    if (physicallyApplied) {
      console.log(
        "Database Updates: Backfilling metadata for already-applied update [" +
          updateModule.id +
          "]"
      );
      await upsertMetadata(updateModule.id, "applied", updateModule.comment || null);
      continue;
    }

    console.log("Database Updates: Applying update [" + updateModule.id + "]");

    let result;
    const initResult = updateModule.init(queryInterface);
    if (initResult && initResult.status === -1) {
      throw new Error(
        "Database Updates: Failed to initialise update " + updateModule.id
      );
    }

    result = await updateModule.apply(true);

    // If an error occured, call the remove method to clean up
    if (result.status === -1) {
      console.log("Database Updates: Removing update");
      result = await updateModule.remove(true);
    } else {
      updateModule.cleanup();
      await upsertMetadata(updateModule.id, "applied", updateModule.comment || null);
      console.log("Database Updates: Update applied");
    }
  }
  console.log("Database Updates: Done");
};

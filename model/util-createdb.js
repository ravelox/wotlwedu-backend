const Config = require("../config/wotlwedu")
const database = require("../util/database")
const {
  DATABASE_VERSION_METADATA_KEY,
  CURRENT_DATABASE_VERSION,
} = require("../util/dbversion");

const Capability = require("./capability");
const Category = require("./category");
const Election = require("./election");
const Friend = require("./friend");
const Group = require("./group");
const GroupMember = require("./groupmember");
const Workgroup = require("./workgroup");
const WorkgroupMember = require("./workgroupmember");
const Image = require("./image");
const Item = require("./item");
const List = require("./list");
const ListItem = require("./listitem");
const Notification = require("./notification");
const Organization = require("./organization");
const Role = require("./role");
const RoleCapability = require("./rolecapability");
const Status = require("./status");
const User = require("./user");
const UserRole = require("./userrole");
const Vote = require("./vote");
const Metadata = require("./metadata");
const Preference = require("./preference");
const SocketInfo = require("./socketinfo")
const TestToken = require("./testtoken")

async function initialiseDatabaseMetadata() {
  await Metadata.sync();

  const versionMetadata = await Metadata.findByPk(DATABASE_VERSION_METADATA_KEY);
  if (!versionMetadata) {
    await Metadata.create({
      name: DATABASE_VERSION_METADATA_KEY,
      value: CURRENT_DATABASE_VERSION.toString(),
      comment: "Current database schema version",
    });
  } else {
    versionMetadata.value = CURRENT_DATABASE_VERSION.toString();
    versionMetadata.comment = "Current database schema version";
    await versionMetadata.save();
  }
}

database.sync({force: Config.db_force_sync})
  .then(async () => {
    await initialiseDatabaseMetadata();
    console.log("Done")
  })
  .catch(err => console.log(err));

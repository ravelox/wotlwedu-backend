const Config = require("../config/wotlwedu")
const FS = require("fs");
const Path = require("path");
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
const AuthAudit = require("./authaudit");
const Organization = require("./organization");
const OrganizationInvite = require("./organizationinvite");
const Role = require("./role");
const RoleCapability = require("./rolecapability");
const SocialIdentity = require("./socialidentity");
const Status = require("./status");
const User = require("./user");
const UserRole = require("./userrole");
const Vote = require("./vote");
const Metadata = require("./metadata");
const Preference = require("./preference");
const SocketInfo = require("./socketinfo")
const TestToken = require("./testtoken")
const PublicPollParticipant = require("./publicpollparticipant");
const PublicPollVote = require("./publicpollvote");
const PublicPollInvite = require("./publicpollinvite");
const ContactSuppression = require("./contactsuppression");
const TrustProfile = require("./trustprofile");
const AbuseAudit = require("./abuseaudit");
const TerminologyUpdate = require("../updates/update-0019");

let createdFreshSchema = false;

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

async function migrateLegacyTerminologyTables() {
  if (Config.db_force_sync) {
    createdFreshSchema = true;
    return;
  }

  const queryInterface = database.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  createdFreshSchema = tables.length === 0;

  TerminologyUpdate.init(queryInterface);
  await TerminologyUpdate.renameTerminologyTables(queryInterface);
}

async function backfillAppliedUpdateMetadataForFreshSchema() {
  if (!createdFreshSchema) {
    return;
  }

  const updatePath = Path.join(__dirname, "..", "updates");
  const updateFiles = FS.readdirSync(updatePath)
    .filter((entry) => /^update-\d+\.js$/.test(entry))
    .sort();

  for (const fileName of updateFiles) {
    const updateModule = require(Path.join(updatePath, fileName));
    if (!updateModule.id) continue;

    const existing = await Metadata.findByPk(updateModule.id);
    if (existing) continue;

    await Metadata.create({
      name: updateModule.id,
      value: "applied",
      comment: updateModule.comment || null,
    });
  }
}

migrateLegacyTerminologyTables()
  .then(() => database.sync({force: Config.db_force_sync}))
  .then(async () => {
    await initialiseDatabaseMetadata();
    await backfillAppliedUpdateMetadataForFreshSchema();
    console.log("Done")
  })
  .catch(err => console.log(err));

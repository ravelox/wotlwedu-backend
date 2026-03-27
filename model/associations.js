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
const Metadata = require("./metadata")
const Preference = require("./preference")
const SocketInfo = require("./socketinfo")
const PublicPollParticipant = require("./publicpollparticipant");
const PublicPollVote = require("./publicpollvote");
const PublicPollInvite = require("./publicpollinvite");
const ContactSuppression = require("./contactsuppression");
const TrustProfile = require("./trustprofile");
const AbuseAudit = require("./abuseaudit");

let _associationsSetup = false;

module.exports.setup = function () {
  if (_associationsSetup) {
    return;
  }

  const isSqliteTest =
    process.env.NODE_ENV === "test" &&
    process.env.WOTLWEDU_DB_DIALECT === "sqlite";

  if (isSqliteTest) {
    // Minimal associations for sqlite-based tests to avoid FK complexity
    _associationsSetup = true;
    return;
  }

  Capability.belongsToMany(Role, { through: RoleCapability });

  Friend.hasOne(User, { foreignKey: "id", sourceKey: "friendId" });
  Friend.hasOne(Status, {foreignKey: "id", sourceKey: "statusId"})

  Group.belongsToMany(User, { through: GroupMember });
  Group.hasMany(GroupMember);
  Group.hasOne(Category, { foreignKey: "id", sourceKey: "categoryId" });

  GroupMember.hasOne(Group, { foreignKey: "id", sourceKey: "groupId" });
  GroupMember.hasOne(User, { foreignKey: "id", sourceKey: "userId" });

  Workgroup.belongsToMany(User, { through: WorkgroupMember });
  Workgroup.hasMany(WorkgroupMember, { foreignKey: "workgroupId" });
  Workgroup.hasOne(Category, { foreignKey: "id", sourceKey: "categoryId" });
  Workgroup.hasOne(Organization, { foreignKey: "id", sourceKey: "organizationId" });

  // WorkgroupMember rows belong to a Workgroup and a User.
  // Using `belongsTo` ensures the FK lives on `workgroupmembers` (not on `workgroups` / `users`).
  WorkgroupMember.belongsTo(Workgroup, {
    foreignKey: "workgroupId",
    targetKey: "id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  WorkgroupMember.belongsTo(User, {
    foreignKey: "userId",
    targetKey: "id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  Item.hasMany(Vote);
  Item.hasMany(ListItem);
  Item.hasOne(Image, { foreignKey: "id", sourceKey: "imageId" });
  Item.hasOne(Category, { foreignKey: "id", sourceKey: "categoryId" });

  ListItem.hasOne(Item, { foreignKey: "id", sourceKey: "itemId" });
  ListItem.hasOne(List, { foreignKey: "id", sourceKey: "listId" });

  List.belongsToMany(Item, { through: ListItem });
  List.hasMany(ListItem);
  List.hasOne(Category, { foreignKey: "id", sourceKey: "categoryId" });

  Role.belongsToMany(Capability, { through: RoleCapability });
  Role.belongsToMany(User, { through: UserRole });

  User.belongsToMany(Role, { through: UserRole });
  User.hasMany(Friend);
  User.hasMany(GroupMember);
  User.hasMany(WorkgroupMember, { foreignKey: "userId" });
  User.hasMany(UserRole);
  User.hasMany(Vote);
  User.hasMany(Notification);
  User.hasMany(AuthAudit, { foreignKey: "actorUserId", sourceKey: "id", as: "authAuditActor" });
  User.hasMany(AuthAudit, { foreignKey: "targetUserId", sourceKey: "id", as: "authAuditTarget" });
  User.hasMany(OrganizationInvite, { foreignKey: "invitedByUserId", sourceKey: "id" });
  User.hasMany(SocialIdentity, { foreignKey: "userId", sourceKey: "id" });
  User.hasOne(TrustProfile, { foreignKey: "userId", sourceKey: "id" });
  User.hasMany(PublicPollInvite, { foreignKey: "creatorUserId", sourceKey: "id" });
  User.hasMany(AbuseAudit, { foreignKey: "actorUserId", sourceKey: "id" });
  User.hasOne(Image, { foreignKey: "id", sourceKey: "imageId" });
  User.hasOne(Organization, { foreignKey: "id", sourceKey: "organizationId" });

  Organization.hasMany(User, { foreignKey: "organizationId", sourceKey: "id" });
  Organization.hasMany(Workgroup, { foreignKey: "organizationId", sourceKey: "id" });
  Organization.hasMany(AuthAudit, { foreignKey: "organizationId", sourceKey: "id" });
  Organization.hasMany(OrganizationInvite, {
    foreignKey: "organizationId",
    sourceKey: "id",
  });

  OrganizationInvite.hasOne(Organization, {
    foreignKey: "id",
    sourceKey: "organizationId",
  });
  OrganizationInvite.hasOne(User, {
    foreignKey: "id",
    sourceKey: "invitedByUserId",
    as: "invitedBy",
  });
  OrganizationInvite.hasOne(User, {
    foreignKey: "id",
    sourceKey: "acceptedByUserId",
    as: "acceptedBy",
  });
  OrganizationInvite.hasOne(User, {
    foreignKey: "id",
    sourceKey: "revokedByUserId",
    as: "revokedBy",
  });

  SocialIdentity.hasOne(User, { foreignKey: "id", sourceKey: "userId" });

  Image.hasMany(Item);
  Image.hasOne(Category, { foreignKey: "id", sourceKey: "categoryId" });

  RoleCapability.hasOne(Role, { foreignKey: "id", sourceKey: "roleId" });
  RoleCapability.hasOne(Capability, { foreignKey: "id", sourceKey: "capabilityId",});

  UserRole.hasOne(User, { foreignKey: "id", sourceKey: "userId" });
  UserRole.hasOne(Role, { foreignKey: "id", sourceKey: "roleId" });

  Election.hasOne(List, { foreignKey: "id", sourceKey: "listId" });
  Election.hasOne(Group, { foreignKey: "id", sourceKey: "groupId" });
  Election.hasOne(Category, { foreignKey: "id", sourceKey: "categoryId" });
  Election.hasOne(Image, { foreignKey: "id", sourceKey: "imageId" });
  Election.hasOne(Status, { foreignKey: "id", sourceKey: "statusId" });
  Election.hasMany(PublicPollParticipant, { foreignKey: "electionId", sourceKey: "id" });
  Election.hasMany(PublicPollVote, { foreignKey: "electionId", sourceKey: "id" });
  Election.hasMany(PublicPollInvite, { foreignKey: "electionId", sourceKey: "id" });
  Election.hasMany(AbuseAudit, { foreignKey: "electionId", sourceKey: "id" });

  Vote.hasOne(Election, { foreignKey: "id", sourceKey: "electionId" });
  Vote.hasOne(User, { foreignKey: "id", sourceKey: "userId" });
  Vote.hasOne(Item, { foreignKey: "id", sourceKey: "itemId" });
  Vote.hasOne(Status, { foreignKey: "id", sourceKey: "statusId" });

  Notification.hasOne(User, { foreignKey: "id", sourceKey: "userId" });
  Notification.hasOne(User, { foreignKey: "id", sourceKey: "senderId", as: "sender", });
  Notification.hasOne(Status, { foreignKey: "id", sourceKey: "statusId",});
  AuthAudit.hasOne(User, { foreignKey: "id", sourceKey: "actorUserId", as: "actor" });
  AuthAudit.hasOne(User, { foreignKey: "id", sourceKey: "targetUserId", as: "target" });
  AuthAudit.hasOne(Organization, { foreignKey: "id", sourceKey: "organizationId" });
  PublicPollParticipant.hasOne(Election, { foreignKey: "id", sourceKey: "electionId" });
  PublicPollVote.hasOne(Election, { foreignKey: "id", sourceKey: "electionId" });
  PublicPollVote.hasOne(Item, { foreignKey: "id", sourceKey: "itemId" });
  PublicPollVote.hasOne(PublicPollParticipant, { foreignKey: "id", sourceKey: "participantId" });
  PublicPollInvite.hasOne(Election, { foreignKey: "id", sourceKey: "electionId" });
  PublicPollInvite.hasOne(User, { foreignKey: "id", sourceKey: "creatorUserId", as: "creatorUser" });
  TrustProfile.hasOne(User, { foreignKey: "id", sourceKey: "userId" });
  AbuseAudit.hasOne(User, { foreignKey: "id", sourceKey: "actorUserId", as: "actor" });
  AbuseAudit.hasOne(Election, { foreignKey: "id", sourceKey: "electionId" });

  Status.hasMany(Notification);
  Status.hasMany(Friend);

  _associationsSetup = true;
};

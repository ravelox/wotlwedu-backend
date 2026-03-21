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
  User.hasMany(OrganizationInvite, { foreignKey: "invitedByUserId", sourceKey: "id" });
  User.hasMany(SocialIdentity, { foreignKey: "userId", sourceKey: "id" });
  User.hasOne(Image, { foreignKey: "id", sourceKey: "imageId" });
  User.hasOne(Organization, { foreignKey: "id", sourceKey: "organizationId" });

  Organization.hasMany(User, { foreignKey: "organizationId", sourceKey: "id" });
  Organization.hasMany(Workgroup, { foreignKey: "organizationId", sourceKey: "id" });
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

  Vote.hasOne(Election, { foreignKey: "id", sourceKey: "electionId" });
  Vote.hasOne(User, { foreignKey: "id", sourceKey: "userId" });
  Vote.hasOne(Item, { foreignKey: "id", sourceKey: "itemId" });
  Vote.hasOne(Status, { foreignKey: "id", sourceKey: "statusId" });

  Notification.hasOne(User, { foreignKey: "id", sourceKey: "userId" });
  Notification.hasOne(User, { foreignKey: "id", sourceKey: "senderId", as: "sender", });
  Notification.hasOne(Status, { foreignKey: "id", sourceKey: "statusId",});

  Status.hasMany(Notification);
  Status.hasMany(Friend);

  _associationsSetup = true;
};

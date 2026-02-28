const Config = require("../config/wotlwedu");
const Sequelize = require("sequelize");

module.exports.Election = [
  "id",
  "name",
  "description",
  "electionType",
  "expiration",
  "categoryId",
  "workgroupId",
  "creator"
];

module.exports.Group = ["id", "name", "description", "categoryId", "creator"];
module.exports.Workgroup = ["id", "name", "description", "categoryId", "organizationId", "creator"];

module.exports.List = ["id", "name", "description", "categoryId", "workgroupId", "creator"];

module.exports.Item = ["id", "name", "description", "url", "location", "categoryId", "workgroupId", "creator"];

module.exports.StatsItem = ["id", "name"];

module.exports.User = [
  "id",
  "firstName",
  "lastName",
  [
    Sequelize.fn(
      "CONCAT",
      Sequelize.col("firstName"),
      " ",
      Sequelize.col("lastName")
    ),
    "fullName",
  ],
  "alias",
  "email",
  "organizationId",
  "creator"
];

module.exports.StatsUser = [
  "id",
  [
    Sequelize.fn(
      "CONCAT",
      Sequelize.col("firstName"),
      " ",
      Sequelize.col("lastName")
    ),
    "name",
  ],
];

module.exports.Image = [
  "id",
  "name",
  "description",
  "contentType",
  "filename",
// Concatenation of filename and URL base needs to be done in each controller 
  "statusId",
  "categoryId",
  "workgroupId",
  "creator"
];

module.exports.Status = ["id", "object", "name"];

module.exports.Category = ["id", "name", "description", "creator"];

module.exports.Role = ["id", "name", "description","protected"];
module.exports.Capability = ["id", "name"];

module.exports.Notification = ["id", "type", "text", "objectId", "createdAt"];
module.exports.NotificationUser = [
  "id",
  "firstName",
  "lastName",
  [
    Sequelize.fn(
      "CONCAT",
      Sequelize.col("user.firstName"),
      " ",
      Sequelize.col("user.lastName")
    ),
    "fullName",
  ],
];
module.exports.NotificationSender = [
  "id",
  "firstName",
  "lastName",
  [
    Sequelize.fn(
      "CONCAT",
      Sequelize.col("sender.firstName"),
      " ",
      Sequelize.col("sender.lastName")
    ),
    "fullName",
  ],
];

module.exports.Preference = ["id", "name", "value"];

module.exports.Friend = [
    "id",
    "firstName",
    "lastName",
    [
      Sequelize.fn(
        "CONCAT",
        Sequelize.col("user.firstName"),
        " ",
        Sequelize.col("user.lastName")
      ),
      "fullName",
    ],
    "alias",
    "email",
    "imageId",
//    "statusId",
  ];

  module.exports.UserFull = [
    "id",
    "firstName",
    "lastName",
    [
      Sequelize.fn(
        "CONCAT",
        Sequelize.col("user.firstName"),
        " ",
        Sequelize.col("user.lastName")
      ),
      "fullName",
    ],
    "alias",
    "email",
    "organizationId",
    "active",
    "verified",
    "enable2fa",
    "admin",
    "systemAdmin",
    "organizationAdmin",
    "workgroupAdmin",
    "adminWorkgroupId",
    "adminGroupId",
  ];

module.exports.Organization = ["id", "name", "description", "active", "creator"];

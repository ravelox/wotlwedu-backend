const Util = require("util");

const database = require("../util/database");
const Security = require("../util/security");

const Config = require("../config/wotlwedu");

const User = require("./user");
const Friend = require("./friend");
const Status = require("./status");
const Group = require("./group");
const GroupMember = require("./groupmember");
const Category = require("./category");
const Item = require("./item");
const List = require("./list");
const ListItem = require("./listitem");
const Vote = require("./vote");
const Election = require("./election");
const Role = require("./role");
const Capability = require("./capability");
const Image = require("./image");
const UserRole = require("./userrole");
const RoleCapability = require("./rolecapability");
const Preference = require("./preference");
const Notification = require("./notification");

const UUID = require("../util/mini-uuid");

const Assoc = require("./associations");
Assoc.setup();

const firstName = "Root";
const lastName = "User";
const alias = "root";
const email = "root@localhost.localdomain";

const rootUser = {
  id: UUID("user"),
  firstName: firstName,
  lastName: lastName,
  alias: alias,
  email: email,
  personType: 1,
  auth: "$2y$12$T54UV8HFNyErzu5KrZG/U.nZYmhGFQx0knV8FsYE3IFd/xzAFEq86",
  active: true,
  verified: true,
  admin: true,
};

function genDefaultCaps() {
  let capNumber = 0;
  let caps = [];

  const datamodels = ["all"].concat(Object.keys(database.models));

  const operations = ["manage", "delete", "edit", "add", "view"];
  const usertypes = ["admin", "owner"];

  for (model of datamodels) {
    for (operation of operations) {
      for (usertype of usertypes) {
        caps.push({
          id: "capa_" + capNumber.toString().padStart(3, "0"),
          name: [model, operation, usertype].join("."),
        });
        capNumber = capNumber + 1;
      }
    }
  }
  return caps;
}

const statusNames = [
  { id: 0, object: "all", name: "Pending" },
  { id: 1, object: "user", name: "Friend" },
  { id: 2, object: "user", name: "Blocked" },
  { id: 3, object: "election", name: "Not Started" },
  { id: 4, object: "election", name: "In Progress" },
  { id: 5, object: "election", name: "Stopped" },
  { id: 6, object: "vote", name: "Yes" },
  { id: 7, object: "vote", name: "No" },
  { id: 8, object: "vote", name: "Maybe" },
  { id: 9, object: "notification", name: "Unread" },
  { id: 10, object: "notification", name: "Read" },
  { id: 11, object: "notification", name: "Archived" },
  { id: 12, object: "notification", name: "Friend Request" },
  { id: 13, object: "notification", name: "Election Start" },
  { id: 14, object: "notification", name: "Share Image" },
  { id: 15, object: "notification", name: "Share Item" },
  { id: 16, object: "notification", name: "Share List" },
];

const defaultCapabilities = genDefaultCaps();

console.log("Initializing database...");

database.sync({ force: Config.db_force_sync }).then((result) => {
  console.log("Done");

  console.log("Adding default user");
  User.create(rootUser)
    .then((ru) => {
      console.log("Internal user ID: " + ru.id);
      return ru;
    })
    .then(async (ru) => {
      console.log("Adding capabilities");
      for (cap of defaultCapabilities) {
        const cap_id = cap.id;
        const cap_name = cap.name;
        const c = new Capability({
          id: cap_id,
          name: cap_name,
          creator: rootUser.id,
        });
        await c.save().catch((err) => console.log(err));
      }
      console.log("Done");
      return ru;
    })
    .then((ru) => {
      const rootRoleName = Config.rootRoleName || "Root Role";
      console.log("Adding root role: " + rootRoleName);
      const r = {
        id: UUID("role"),
        name: rootRoleName,
        description: "Role for Root User",
        protected: true,
        creator: rootUser.id,
      };
      Role.create(r).then((role) => {
        ru.addRole(role, {
          through: { id: UUID("userrole"), creator: rootUser.id },
        }).then(() => {
          for (capname of ["all.manage.admin"]) {
            console.log("Adding  " + capname + " to " + role.name);
            Capability.findOne({ where: { name: capname } }).then((capa) => {
              role
                .addCapability(capa, {
                  through: { id: UUID("rolecap"), creator: rootUser.id },
                })
                .then((result) => {
                  console.log("Done");
                });
            });
          }
        });
      });
      return ru;
    })
    .then((ru) => {
      const defaultRoleName = Config.defaultRoleName || "Default Role"
      console.log("Adding default user role: " + defaultRoleName);
      const r = {
        id: UUID("role"),
        name: defaultRoleName,
        description: "Default role for all users",
        protected: true,
        creator: rootUser.id,
      };
      Role.create(r).then((role) => {
        ru.addRole(role, {
          through: { id: UUID("userrole"), creator: rootUser.id },
        }).then(() => {
          for (capname of ["all.manage.owner"]) {
            console.log("Adding  " + capname + " to " + role.name);
            Capability.findOne({ where: { name: capname } }).then((capa) => {
              role
                .addCapability(capa, {
                  through: { id: UUID("rolecap"), creator: rootUser.id },
                })
                .then((result) => {
                  console.log("Done");
                });
            });
          }
        });
      });
      return ru;
    })
    .then(async (ru) => {
      for (s of statusNames) {
        s.creator = rootUser.id;
        await Status.create(s);
      }
    })
    .catch((err) => console.log(err));
});

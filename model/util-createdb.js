const Config = require("../config/wotlwedu")
const database = require("../util/database")

const Capability = require("./capability");
const Category = require("./category");
const Election = require("./election");
const Friend = require("./friend");
const Group = require("./group");
const GroupMember = require("./groupmember");
const Image = require("./image");
const Item = require("./item");
const List = require("./list");
const ListItem = require("./listitem");
const Notification = require("./notification");
const Role = require("./role");
const RoleCapability = require("./rolecapability");
const Status = require("./status");
const User = require("./user");
const UserRole = require("./userrole");
const Vote = require("./vote");
const Metadata = require("./metadata");
const Preference = require("./preference");
const SocketInfo = require("./socketinfo")

database.sync({force: Config.db_force_sync})
.then(()=>{
    console.log("Done")
})
.catch(err=>console.log(err));
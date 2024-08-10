const Config = require("../config/wotlwedu");
const User = require("./user");
const Friend = require("./friend");
const Category = require("./category");
const Group = require("./group");
const Role = require("./role");

const UUID = require("../util/mini-uuid");
const { getStatusIdByName } = require("../util/helpers");

const Assoc = require("./associations");
Assoc.setup();

let userList = [
  {
    id: null,
    alias: "ravelox",
    firstName: "Something",
    lastName: "McSomething",
    email: "test1@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "fairynuff",
    firstName: "Mr",
    lastName: "Nuff",
    email: "test2@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "apartridge",
    firstName: "Alan",
    lastName: "Patridge",
    email: "test3@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "whartnell",
    firstName: "William",
    lastName: "Hartnell",
    email: "whartnell@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "ptroughton",
    firstName: "Patrick",
    lastName: "Troughton",
    email: "ptroughton@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "jpertwee",
    firstName: "Jon",
    lastName: "Pertwee",
    email: "jpertwee@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "tbaker",
    firstName: "Tom",
    lastName: "Baker",
    email: "tbaker@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "pdavison",
    firstName: "Peter",
    lastName: "Davison",
    email: "pdavison@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "cbaker",
    firstName: "Colin",
    lastName: "Baker",
    email: "cbaker@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "smccoy",
    firstName: "Sylvester",
    lastName: "McCoy",
    email: "smccoy@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "pmcgann",
    firstName: "Paul",
    lastName: "McGann",
    email: "pmcgann@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "jhurt",
    firstName: "John",
    lastName: "Hurt",
    email: "jhurt@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "cecclestone",
    firstName: "Christopher",
    lastName: "Ecclestone",
    email: "cecclestone@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "dtennant",
    firstName: "David",
    lastName: "Tennant",
    email: "dtennant@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "msmith",
    firstName: "Matt",
    lastName: "Smith",
    email: "msmith@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "pcapaldi",
    firstName: "Peter",
    lastName: "Capaldi",
    email: "pcapaldi@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "jwhitaker",
    firstName: "Jodie",
    lastName: "Whitaker",
    email: "jwhitaker@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "ngatwa",
    firstName: "Ncuti",
    lastName: "Gatwa",
    email: "ngatwa@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "ichesterton",
    firstName: "Ian",
    lastName: "Chesterton",
    email: "ichesterton@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "bwright",
    firstName: "Barbara",
    lastName: "Wright",
    email: "bwright@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "sforeman",
    firstName: "Susan",
    lastName: "Foreman",
    email: "sforeman@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "vicki",
    firstName: "Vicki",
    lastName: "Noname",
    email: "vicki@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "staylor",
    firstName: "Steven",
    lastName: "Taylor",
    email: "staylor@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "katarina",
    firstName: "Katarina",
    lastName: "Greekperson",
    email: "katarina@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "skingdom",
    firstName: "Sara",
    lastName: "Kingdom",
    email: "skingdom@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "dchaplet",
    firstName: "Dodo",
    lastName: "Chaplet",
    email: "dchaplet@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "polly",
    firstName: "Polly",
    lastName: "Someone",
    email: "polly@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "bjackson",
    firstName: "Ben",
    lastName: "Jackson",
    email: "bjackson@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "jmccrimmon",
    firstName: "Jamie",
    lastName: "McCrimmon",
    email: "jmccrimmon@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "vwaterfield",
    firstName: "Victoria",
    lastName: "Waterfield",
    email: "vwaterfield@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "zheriot",
    firstName: "Zoe",
    lastName: "Heriot",
    email: "zheriot@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "lshaw",
    firstName: "Liz",
    lastName: "Shaw",
    email: "lshaw@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "jgrant",
    firstName: "Jo",
    lastName: "Grant",
    email: "jgrant@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "sjsmith",
    firstName: "Sarah-Jane",
    lastName: "Smith",
    email: "sjsmith@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "hsullivan",
    firstName: "Harry",
    lastName: "Sullivan",
    email: "hsullivan@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "leela",
    firstName: "Leela",
    lastName: "Sevateem",
    email: "leela@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "romana",
    firstName: "Romana",
    lastName: "Advoratrelundar",
    email: "romana@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "adric",
    firstName: "Adric",
    lastName: "Alzarian",
    email: "adric@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "tjovanka",
    firstName: "Tegan",
    lastName: "Jovanka",
    email: "tjovanka@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "nyssa",
    firstName: "Nyssa",
    lastName: "O'Traken",
    email: "nyssa@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "vturlough",
    firstName: "Vislor",
    lastName: "Turlough",
    email: "vturlough@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "pbrown",
    firstName: "Perpugilliam",
    lastName: "Brown",
    email: "pbrown@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "mbush",
    firstName: "Melanie",
    lastName: "Bush",
    email: "mbush@ravelox.co.uk",
    active: true,
  },
  {
    id: null,
    alias: "ace",
    firstName: "Dorothy",
    lastName: "McShane",
    email: "ace@ravelox.co.uk",
    active: true,
  },
];

const relationships = [
  { name1: "root", name2: "ravelox" },
  { name1: "root", name2: "apartridge" },
  { name1: "ravelox", name2: "fairynuff" },
  { name1: "whartnell", name2: "ptroughton" },
  { name1: "ptroughton", name2: "jpertwee" },
  { name1: "jpertwee", name2: "tbaker" },
  { name1: "tbaker", name2: "pdavison" },
  { name1: "pdavison", name2: "cbaker" },
  { name1: "cbaker", name2: "smccoy" },
  { name1: "smccoy", name2: "pmcgann" },
  { name1: "pmcgann", name2: "jhurt" },
  { name1: "jhurt", name2: "cecclestone" },
  { name1: "cecclestone", name2: "dtennant" },
  { name1: "dtennant", name2: "msmith" },
  { name1: "msmith", name2: "pcapaldi" },
  { name1: "pcapaldi", name2: "jwhitaker" },
  { name1: "jwhitaker", name2: "ngatwa" },
  { name1: "whartnell", name2: "ichesterton" },
  { name1: "whartnell", name2: "bwright" },
  { name1: "whartnell", name2: "sforeman" },
  { name1: "whartnell", name2: "vicki" },
  { name1: "whartnell", name2: "staylor" },
  { name1: "whartnell", name2: "katarina" },
  { name1: "whartnell", name2: "skingdom" },
  { name1: "whartnell", name2: "dchaplet" },
  { name1: "whartnell", name2: "polly" },
  { name1: "whartnell", name2: "bjackson" },
  { name1: "ptroughton", name2: "polly" },
  { name1: "ptroughton", name2: "bjackson" },
  { name1: "ptroughton", name2: "jmccrimmon" },
  { name1: "ptroughton", name2: "vwaterfield" },
  { name1: "ptroughton", name2: "zheriot" },
  { name1: "jpertwee", name2: "lshaw" },
  { name1: "jpertwee", name2: "jgrant" },
  { name1: "jpertwee", name2: "sjsmith" },
  { name1: "tbaker", name2: "sjsmith" },
  { name1: "tbaker", name2: "hsullivan" },
  { name1: "tbaker", name2: "leela" },
  { name1: "tbaker", name2: "romana" },
  { name1: "tbaker", name2: "adric" },
  { name1: "tbaker", name2: "tjovanka" },
  { name1: "tbaker", name2: "nyssa" },
  { name1: "pdavison", name2: "adric" },
  { name1: "pdavison", name2: "tjovanka" },
  { name1: "pdavison", name2: "nyssa" },
  { name1: "pdavison", name2: "vturlough" },
  { name1: "pdavison", name2: "pbrown" },
  { name1: "cbaker", name2: "pbrown" },
  { name1: "cbaker", name2: "mbush" },
  { name1: "smccoy", name2: "mbush" },
  { name1: "smccoy", name2: "ace" },
];

const categories = [
  { name: "Food", description: "Meals to eat" },
  { name: "Movies", description: "Movies to watch" },
  { name: "Events", description: "Places to go" },
  { name: "Work", description: "Stuff related to work" },
  { name: "Personal", description: "Stuff related to outside of work" },
];

const groups = [
  { name: "Office", description: "Co-workers" },
  { name: "Family", description: "My family" },
];

let rootUser = null;

async function addUsers() {
  const defaultRoleName = Config.defaultRoleName || "Default Role";
  for (user of userList) {
    console.log("Looking for " + user.alias);
    const foundUser = await User.findOne({ where: { alias: user.alias } });
    if (foundUser) {
      user.id = foundUser.id;
      console.log(user.alias + " found");
    } else {
      user.id = UUID("user");
      user.creator = rootUser.id;
      const newUser = new User(user);
      await newUser
        .save()
        .then(() => {
          console.log(user.alias + " created");
          Role.findOne({ where: { name: defaultRoleName } })
            .then(async (foundRole) => {
              await newUser.addRole(foundRole, {
                through: { id: UUID("userrole"), creator: rootUser.id },
              });

              console.log("Added to " + defaultRoleName);
            })
            .catch((err) => console.log(err));
        })
        .catch((err) => console.log(err));
    }
  }
}

async function addFriends() {
  const friendStatus = await getStatusIdByName("Friend");
  for (relationship of relationships) {
    userid1 = userList.find((user) => user.alias === relationship.name1).id;
    userid2 = userList.find((user) => user.alias === relationship.name2).id;

    const thisway = new Friend({
      id: UUID("friend"),
      userId: userid1,
      friendId: userid2,
      creator: rootUser.id,
      statusId: friendStatus,
    });
    const thatway = new Friend({
      id: UUID("friend"),
      userId: userid2,
      friendId: userid1,
      creator: rootUser.id,
      statusId: friendStatus,
    });

    await thisway
      .save()
      .then(() => {
        console.log(relationship.name1 + "<->" + relationship.name2 + " added");
      })
      .catch((err) => console.log(err));
    await thatway
      .save()
      .then(() => {
        console.log(relationship.name2 + "<->" + relationship.name1 + " added");
      })
      .catch((err) => console.log(err));
  }
}

async function addCategories() {
  for (category of categories) {
    const newCategory = new Category();
    newCategory.id = UUID("category");
    newCategory.creator = rootUser.id;
    newCategory.name = category.name;
    newCategory.description = category.description;
    await newCategory
      .save()
      .then(() => {
        console.log("Category: " + category.name + " added");
      })
      .catch((err) => console.log(err));
  }
}

function random_number(range) {
  return Math.floor(Math.random() * range);
}

async function addGroups() {
  for (group of groups) {
    const newGroup = new Group();
    newGroup.id = UUID("group");
    newGroup.creator = rootUser.id;
    newGroup.name = group.name;
    newGroup.description = group.description;
    await newGroup
      .save()
      .then(async (addedGroup) => {
        console.log("Group: " + group.name + " added");
        const numUsers = random_number(10);
        console.log("Adding " + (+numUsers + 1) + " group members");
        for (let i = 0; i <= +numUsers; i++) {
          const randomUser = random_number(userList.length);
          const userId = userList[randomUser].id;
          const foundUser = await User.findByPk(userId);

          if (foundUser) {
            addedGroup
              .addUser(foundUser, {
                through: { id: UUID("groupmember"), creator: rootUser.id },
              })
              .then((memberAdded) => {
                if (memberAdded) {
                  console.log(userId + " added to " + addedGroup.name);
                } else {
                  console.log(
                    "Cannot add " + userId + " to " + addedGroup.name
                  );
                }
              })
              .catch((err) => console.log(err));
          }
        }
      })
      .catch((err) => console.log(err));
  }
}

async function findRoot() {
  rootUser = await User.findOne({ where: { alias: "root" } }).catch((err) =>
    console.log(err)
  );
  if (rootUser) {
    console.log("Found Root User: " + rootUser.id);
    userList.push(rootUser);
  } else {
    console.log("Root User not found");
  }
}

async function makeFriends() {
  await findRoot();
  await addUsers();
  await addFriends();
  await addCategories();
  await addGroups();
}

makeFriends();

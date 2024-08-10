const Config = require("../config/wotlwedu");

const UUID = require("../util/mini-uuid");
const User = require("./user");
const Group = require("./group");
const Image = require("./image");
const Item = require("./item");
const Category = require("./category");
const Election = require("./election");
const List = require("./list");
const Role = require("./role");

const { getStatusIdByName } = require("../util/helpers");

const Assoc = require("./associations");
Assoc.setup();

let newUser;
let ru;
let newGroup;
let newCategory;
let newList;
let newItem;
let newElection;

User.findOne({ where: { alias: "root" } })
  .then((rootUser) => {
    if (!rootUser) throw new Error("Root user not found");

    ru = rootUser;
    console.log("Root User: " + rootUser.id);

    newUser = new User();

    newUser.email = "test5@ravelox.co.uk";
    newUser.firstName = "Snuffy";
    newUser.lastName = "Walden";
    newUser.alias = "testuser1";
    newUser.auth =
      "$2y$05$wDyH0fkIsDHC3C5GGJqqAe7ssCPlXJAR9syE.4S49o/POTYPFswNG";

    newUser.id = UUID("user");
    newUser.creator = ru.id;

    return newUser.save();
  })
  .then((addedUser) => {
    if (!addedUser) throw new Error("New user not added");

    console.log("New User: " + newUser.id);

    const defaultRoleName = Config.defaultRoleName || "Default Role";
    return Role.findOne({ where: { name: defaultRoleName } });
  })
  .then((defaultRole) => {
    return newUser.addRole(defaultRole, {
      through: { id: UUID("userrole"), creator: ru.id },
    });
  })
  .then((addedUserToRole) => {
    newCategory = new Category();
    newCategory.id = UUID("category");
    newCategory.creator = newUser.id;

    newCategory.name = "TestCategory1";
    newCategory.description = "Category added through Node.js";

    return newCategory.save();
  })
  .then((addedCategory) => {
    if (!addedCategory) throw new Error("New Category not added");

    console.log("New Category: " + newCategory.id);

    newGroup = new Group();

    newGroup.id = UUID("group");
    newGroup.creator = newUser.id;

    newGroup.name = "TestGroup1";
    newGroup.description = "Group added through util Node code";
    newGroup.categoryId = newCategory.id;

    return newGroup.save();
  })
  .then((addedGroup) => {
    if (!addedGroup) throw new Error("New group not added");

    console.log("New Group: " + newGroup.id);
    return newGroup.addUser(newUser, {
      through: { id: UUID("groupmember"), creator: newUser.id },
    });
  })
  .then((addedGroupMembers) => {
    if (!addedGroupMembers) throw new Error("New user not added to group");

    console.log("New Group Member: " + addedGroupMembers[0].id);
    newImage = new Image();

    newImage.id = UUID("image");
    newImage.creator = newUser.id;

    newImage.name = "TestImage1";
    newImage.description = "A picture of a grape";
    newImage.url = "http://localhost:9876/images/grape.png";
    newImage.contentType = "image/png";
    newImage.categoryId = newCategory.id;

    return newImage.save();
  })
  .then((addedImage) => {
    if (!addedImage) throw new Error("New image not added");

    console.log("New image: " + newImage.id);

    newItem = new Item();
    newItem.id = UUID("item");
    newItem.creator = newUser.id;

    newItem.name = "TestItem1";
    newItem.description = "Item added through Node.js";
    newItem.imageId = newImage.id;
    newItem.categoryId = newCategory.id;

    return newItem.save();
  })
  .then((addedItem) => {
    if (!addedItem) throw new Error("New item not added");

    console.log("New item: " + newItem.id);

    newList = new List();
    newList.id = UUID("list");
    newList.creator = newUser.id;

    newList.name = "TestList1";
    newList.description = "List added through Node.js";

    return newList.save();
  })
  .then((addedList) => {
    if (!addedList) throw new Error("New List not added");

    console.log("New list: " + newList.id);

    return newList.addItem(newItem, {
      through: { id: UUID("listitem"), creator: ru.id },
    });
  })
  .then((addedItemToList) => {
    if (!addedItemToList) throw new Error("New item not added to list");

    newElection = new Election();

    newElection.id = UUID("election");
    newElection.creator = newUser.id;

    newElection.name = "TestElection1";
    newElection.description = "Election added through Node.js";

    newElection.categoryId = newCategory.id;
    newElection.listId = newList.id;
    newElection.groupId = newGroup.id;
    newElection.electionType = 2;
    newElection.expiration = new Date();

    return getStatusIdByName("Not Started").then((foundStatusId) => {
      newElection.statusId = foundStatusId;
      return newElection.save();
    });
  })
  .then((addedElection) => {
    if (!addedElection) throw new Error("New election not added");

    console.log("New election: " + newElection.id);
  })
  .catch((err) => {
    console.log(err);
  });

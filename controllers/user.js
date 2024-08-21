const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize");
const Path = require("path");

const Config = require("../config/wotlwedu");
const UUID = require("../util/mini-uuid");
const Security = require("../util/security");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");
const {
  copyObject,
  bulkUpdate,
  getStatusIdByName,
  deleteImageFile,
} = require("../util/helpers");

const User = require("../model/user");
const Friend = require("../model/friend");
const Image = require("../model/image");
const Notify = require("../util/notification");
const Status = require("../model/status");
const Notification = require("../model/notification");
const Role = require("../model/role");

const Attributes = require("../model/attributes");

function generateIncludes(details) {
  const includes = [];
  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("friend")) {
      includes.push({
        model: Friend,
        attributes: ["statusId"],
        include: [
          { model: User, attributes: Attributes.Friend },
          { model: Status, attributes: Attributes.Status },
        ],
      });
    }
    if (splitDetail.includes("image")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
        "url",
      ]);
      includes.push({ model: Image, attributes: modImageAttributes });
    }
  }
  return includes;
}

exports.getUser = async (req, res, next) => {
  const options = {};
  const userToFind = req.params.userId;

  // If the user ID wasn't in the Url, error out
  if (!userToFind) return StatusResponse(res, 400, "No user ID provided");

  let whereCondition = {};

  whereCondition.id = userToFind;
  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    if (userToFind !== req.authUserId) {
      whereCondition.creator = req.authUserId;
    }
  }

  const includes = generateIncludes(req.query.detail);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.UserFull;

  // Find the user in the table
  User.findOne(options)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");
      return StatusResponse(res, 200, "OK", { user: foundUser });
    })
    .catch((err) => next(err));
};

exports.getAllUser = (req, res, next) => {
  let userFilter = req.query.filter;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};

  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;

  let whereCondition = {};

  if (userFilter) {
    whereCondition = {
      [Op.or]: [
        { firstName: { [Op.like]: "%" + userFilter + "%" } },
        { lastName: { [Op.like]: "%" + userFilter + "%" } },
        { email: { [Op.like]: "%" + userFilter + "%" } },
        { alias: { [Op.like]: "%" + userFilter + "%" } },
      ],
    };
  }

  if (!Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const includes = generateIncludes(req.query.detail);

  // Sort order
  options.order = [["lastName"], ["firstName"]];
  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.UserFull;
  options.distinct = true;

  User.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        users: [],
      });
    }

    return StatusResponse(res, 200, "OK", {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      users: rows,
    });
  });
};

exports.putAddUser = (req, res, next) => {
  // Populate the user properties from the form
  const userToAdd = new User();
  userToAdd.alias = req.body.alias;
  userToAdd.firstName = req.body.firstName;
  userToAdd.lastName = req.body.lastName;
  userToAdd.email = req.body.email;
  if (req.body.active) userToAdd.active = req.body.active === "on";
  if (req.body.admin) userToAdd.admin = req.body.admin === "on";
  if (req.body.imageId) userToAdd.imageId = req.body.imageId;
  userToAdd.creator = req.authUserId;
  userToAdd.id = UUID("user");

  // Check to see if the supplied email already exists
  User.findOne({ where: { email: userToAdd.email } })
    .then((foundUser) => {
      if (foundUser)
        return StatusResponse(res, 421, "Email address already exists");

      const defaultRoleName = Config.defaultRoleName || "Default Role";
      // Must add the user to a default role
      Role.findOne({ where: { name: defaultRoleName } })
        .then((foundRole) => {
          if (!foundRole)
            return StatusResponse(res, 421, "No default role is available");

          // Save the user to the database
          userToAdd
            .save()
            .then((addedUser) => {
              if (!addedUser)
                return StatusResponse(res, 500, "Cannot add user");

              userToAdd
                .addRole(foundRole, {
                  through: {
                    id: UUID("userrole"),
                    creator: req.authUserId,
                  },
                })
                .then(() => {
                  return StatusResponse(res, 200, "OK", {
                    user: copyObject(addedUser, Attributes.UserFull),
                  });
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.deleteUser = async (req, res, next) => {
  const userToFind = req.params.userId;
  const newOwner = req.params.ownerId;
  const reassign = req.params.ownerId ? true : false;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  // Check that the user isn't trying to delete themselves
  if (userToFind === req.authUserId)
    return StatusResponse(res, 421, "Cannot delete self");

  User.findByPk(userToFind)
    .then(async (foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      // Ownership check if the curent user is NOT an admin
      if (
        !Security.getVerdict(req.verdicts, "delete").isAdmin &&
        !Security.isOwner(req.authUserId, foundUser)
      ) {
        return StatusResponse(res, 421, "Not owner");
      }

      if (reassign) {
        // Update the creator ID in all the tables
        const updates = [{ creator: newOwner }];
        await bulkUpdate(updates, { where: { creator: foundUser.id } });
      }

      // Most database tables will cascade the deletion
      // Exeptions are Roles and Capabilities otherwise that
      // would compromise the security model

      // We need to be mindful of the image files that are stored
      // outside of the database

      await Image.findAll({ where: { creator: foundUser.id } }).then(
        (foundImages) => {
          if (foundImages) {
            for (i of foundImages) {
              deleteImageFile(Config.imageDir + i.filename)
                .then((result) => {
                  /* File deleted */
                })
                .catch((err) => next(err));
            }
          }
        }
      );

      await foundUser
        .destroy({ options: { cascade: true } })
        .then((destroyedUser) => {
          if (!destroyedUser)
            return StatusResponse(res, 500, "Cannot delete user");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.postUpdateUser = (req, res, next) => {
  const userToFind = req.params.userId;
  let emailChange = false;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");

  User.findByPk(userToFind)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      // Ownership check if the curent user is NOT an admin
      // unless the user is updating their own details

      if (
        !(userToFind === req.authUserId) &&
        !Security.getVerdict(req.verdicts, "edit").isAdmin &&
        !Security.isOwner(req.authUserId, foundUser)
      ) {
        return StatusResponse(res, 421, "Not owner");
      }

      if (req.body.alias) foundUser.alias = req.body.alias;
      if (req.body.firstName) foundUser.firstName = req.body.firstName;
      if (req.body.lastName) foundUser.lastName = req.body.lastName;
      if (req.body.active || req.body.active === false)
        foundUser.active = req.body.active;
      if (req.body.verified || req.body.verified === false)
        foundUser.verified = req.body.verified;
      if (req.body.admin || req.body.admin === false)
        foundUser.admin = req.body.admin;
      if (req.body.imageId) foundUser.imageId = req.body.imageId;

      /* If the email address is being changed, keep it in a temporary
      field and get confirmation from the original owner. While that
      is happening, we will unverify the user.
      There is a 3-day expiration timer on the confirmation */
      if (req.body.email) {
        if (req.body.email !== foundUser.email) {
          foundUser.changeToEmail = req.body.email;
          foundUser.verified = false;
          foundUser.registerToken = UUID("wotlwedu");
          foundUser.registerTokenExpire = Date.now() + 3600000 * 24 * 30;
          emailChange = true;
        }
      }

      if (req.body.enable2fa || req.body.enable2fa === false) {
        foundUser.enable2fa = req.body.enable2fa;
      }

      foundUser
        .save()
        .then((user) => {
          if (!user) return StatusResponse(res, 500, "Unable to update user");
        })
        .then(() => {
          if (emailChange) {
            Mailer.sendEmailChangeMessage(
              foundUser.email,
              foundUser.changeToEmail,
              foundUser.registerToken
            )
              .then(() => {
                return StatusResponse(res, 200, "User updated", {
                  user: copyObject(foundUser, Attributes.UserFull),
                  emailChange: emailChange,
                });
              })
              .catch((err) => {
                return StatusResponse(
                  res,
                  500,
                  "Unable to send address change email",
                  { error: err }
                );
              });
          } else {
            return StatusResponse(res, 200, "User updated", {
              user: copyObject(foundUser, Attributes.UserFull),
              emailChange: emailChange,
            });
          }
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.getUserFriends = async (req, res, next) => {
  let userToFind = req.params.userId;
  const showBlocked = req.query.blocked;

  let whereCondition = {};
  const options = {};

  if (!userToFind) {
    userToFind = req.authUserId;
  }

  if (!showBlocked) {
    const blockedStatus = await getStatusIdByName("Blocked");
    whereCondition.statusId = { [Op.ne]: blockedStatus };
  }

  whereCondition.userId = userToFind;

  options.where = whereCondition;

  options.attributes = ["id"];

  // Sort order
  options.order = [
    [User, "lastName"],
    [User, "firstName"],
  ];

  const includes = [];

  const modImageAttributes = Attributes.Image.slice();
  modImageAttributes.push([
    Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("filename")),
    "url",
  ]);
  const imageIncludes = { model: Image, attributes: modImageAttributes };
  const userIncludes = {
    model: User,
    attributes: Attributes.Friend,
    include: imageIncludes,
  };
  const statusIncludes = { model: Status, attributes: Attributes.Status };
  includes.push(userIncludes);
  includes.push(statusIncludes);

  options.include = includes;
  options.distinct = true;

  // Find the friends in the table
  Friend.findAndCountAll(options)
    .then(({ count, rows }) => {
      if (count <= 0) {
        return StatusResponse(res, 200, "OK", {
          total: 0,
          friends: [],
        });
      } else {
        return StatusResponse(res, 200, "OK", {
          total: count,
          friends: rows,
        });
      }
    })
    .catch((err) => next(err));
};

// There are 2 steps to the friend process
// an add post is made by the initiator. This will create a friend record
// but it will be marked as pending until the friend accepts.
// Additionally, the friend may block the intiator to prevent further requests
// This function either takes a userId and friendId in the parameters
// or, if those parameters are not present, will use the authUserId from the request
// and an email address in the body as the friend
exports.putAddFriend = (req, res, next) => {
  const userToFind = req.params.userId;
  const friendToFind = req.params.friendId;
  const userOptions = {};
  const friendOptions = {};

  if (!userToFind) {
    if (!req.authUserId) return StatusResponse(res, 421, "No user ID provided");
    userOptions.where = { id: req.authUserId };
  } else {
    userOptions.where = { id: userToFind };
  }

  if (!friendToFind) {
    if (!req.body.email)
      return StatusResponse(res, 421, "No friend ID or email address provided");
    friendOptions.where = { email: req.body.email };
  } else {
    friendOptions.where = { id: friendToFind };
  }

  User.findOne(userOptions)
    .then((foundUser) => {
      if (!foundUser)
        return StatusResponse(res, 404, "User not found", {
          userId: userToFind,
        });

      User.findOne(friendOptions)
        .then((foundFriend) => {
          if (!foundFriend) return StatusResponse(res, 404, "Friend not found");

          Friend.findAll({
            where: {
              [Op.or]: [
                { userId: foundUser.id, friendId: foundFriend.id },
                { userId: foundFriend.id, friendId: foundUser.id },
              ],
            },
          })
            .then(async (foundRelationships) => {
              if (!foundRelationships) {
                return StatusResponse(res, 500, "Cannot access relationships");
              } else if (foundRelationships.length === 0) {
                // Otherwise add the relationship and send the friend request
                const friendship = new Friend();

                friendship.id = UUID("friend");
                friendship.userId = foundUser.id;
                friendship.friendId = foundFriend.id;
                // Create a token with a 30-day expiry
                friendship.token = UUID("wotlwedu");
                friendship.tokenExpire = Date.now() + 3600000 * 24 * 30;
                friendship.creator = req.authUserId;

                friendship
                  .save()
                  .then((friendresult) => {
                    if (!friendresult)
                      return StatusResponse(
                        res,
                        500,
                        "Unable to add relationship"
                      );
                  })
                  .catch((err) => next(err));

                const friendNotification = await getStatusIdByName(
                  "Friend Request"
                );
                await Notify.sendNotification(
                  req.authUserId,
                  foundFriend.id,
                  friendNotification,
                  friendship.token,
                  req.authName + " wants to be friends"
                );

                return StatusResponse(res, 200, "OK", {
                  friendshipToken: friendship.token,
                });
              } else {
                let pending = false;
                let blocked = false;
                const pendingStatus = await getStatusIdByName("Pending");
                const blockedStatus = await getStatusIdByName("Blocked");
                foundRelationships.forEach((relationship) => {
                  if (relationship.statusId === pendingStatus) pending = true;
                  if (relationship.statusId === blockedStatus) blocked = true;
                });

                if (blocked === true)
                  return StatusResponse(res, 421, "Blocked");

                if (pending === true)
                  return StatusResponse(res, 421, "Request pending");

                return StatusResponse(res, 421, "Already friends");
              }
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

function getRelationshipDetails(relationshipId) {
  return new Promise((resolve, reject) => {
    if (!relationshipId)
      resolve({ status: 200, message: "OK", user: null, friend: null });
    Friend.findByPk(relationshipId)
      .then((result) => {
        if (!result)
          resolve({ status: 404, message: "Relationship not found" });
        resolve({
          status: 200,
          message: "OK",
          user: result.userId,
          friend: result.friendId,
        });
      })
      .catch((err) => reject(err));
  });
}

exports.deleteRelationship = (req, res, next) => {
  let userToFind = req.params.userId;
  let friendToFind = req.params.friendId;
  let relationshipId = req.params.relationshipId;

  // We need to call this every time to determine
  // the user and friend IDs because when a relationshipId
  // is provider, the user IDs are not
  // If there is no relationship Id, this will return null
  // values which we can overwrite with the data we DO have
  getRelationshipDetails(relationshipId)
    .then((result) => {
      if (result.status !== 200)
        return StatusResponse(res, result.status, result.message);

      if (result && result.user && result.friend) {
        userToFind = result.user;
        friendToFind = result.friend;
      }
    })
    .then(() => {
      if (!userToFind || !friendToFind)
        return StatusResponse(res, 404, "Cannot find relationship");

      const friendWhereCondition = {
        [Op.or]: [
          { userId: userToFind, friendId: friendToFind },
          { userId: friendToFind, friendId: userToFind },
        ],
      };
      const notifWhereCondition = {
        [Op.or]: [
          { userId: userToFind, senderId: friendToFind },
          { userId: friendToFind, senderId: userToFind },
        ],
      };

      const options = {};
      options.where = notifWhereCondition;

      Notification.destroy(options)
        .then((deletedNotifications) => {
          options.where = friendWhereCondition;
          Friend.destroy(options)
            .then((deletedFriends) => {
              if (!deletedFriends)
                return StatusResponse(res, 500, "Cannot delete relationship");

              return StatusResponse(res, 200, "OK", {
                user: userToFind,
                friend: friendToFind,
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    });
};

exports.putBlockUser = (req, res, next) => {
  let userToFind = req.params.userId;
  const blockToFind = req.params.blockUser;

  if (!userToFind) {
    userToFind = req.authUserId;
  }
  if (!blockToFind) return StatusResponse(res, 421, "No block ID provided");

  User.findByPk(userToFind)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      User.findByPk(blockToFind)
        .then((blockUser) => {
          if (!blockUser)
            return StatusResponse(res, 404, "Block user not found");

          // Delete any relationship that exists already
          Friend.destroy({
            where: {
              [Op.or]: [
                {
                  userId: foundUser.id,
                  friendId: blockUser.id,
                },
                {
                  userId: blockUser.id,
                  friendId: foundUser.id,
                },
              ],
            },
          })
            .then(async () => {
              // Add a block relationship
              const blockFriend = new Friend();
              const blockedStatus = await getStatusIdByName("Blocked");
              blockFriend.id = UUID("block");
              blockFriend.creator = req.authUserId;
              blockFriend.userId = foundUser.id;
              blockFriend.friendId = blockUser.id;
              blockFriend.statusId = blockedStatus;

              blockFriend.save().then((blockedFriend) => {
                if (!blockedFriend)
                  return StatusResponse(res, 500, "Cannot add friend block");

                return StatusResponse(res, 200, "OK");
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.deleteBlockUser = (req, res, next) => {
  const userToFind = req.params.userId;
  const blockToFind = req.params.blockId;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");
  if (!blockToFind) return StatusResponse(res, 421, "No block ID provided");

  User.findByPk(userToFind)
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      User.findByPk(blockToFind)
        .then((blockUser) => {
          if (!blockUser)
            return StatusResponse(res, 404, "Block user not found");

          // Delete any relationship that exists already
          Friend.destroy({
            where: {
              [Op.or]: [
                {
                  userId: foundUser.id,
                  friendId: blockUser.id,
                },
                {
                  userId: blockUser.id,
                  friendId: foundUser.id,
                },
              ],
            },
          })
            .then((deletedBlock) => {
              if (!deletedBlock)
                return StatusResponse(res, 500, "Cannot delete block");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.getAcceptFriendRequest = async (req, res, next) => {
  const tokenToFind = req.params.tokenId;
  const friendStatus = await getStatusIdByName("Friend");

  if (!tokenToFind) return StatusResponse(res, 421, "No token ID provided");

  // Can only be accepted by the requestee
  // and the token must still be valid
  Friend.findOne({
    where: { token: tokenToFind, tokenExpire: { [Op.gte]: Date.now() } },
  })
    .then((foundRelationship) => {
      if (!foundRelationship)
        return StatusResponse(res, 404, "Friend request not found");

      if (foundRelationship.friendId !== req.authUserId)
        return StatusResponse(res, 421, "Not owner");

      foundRelationship.token = null;
      foundRelationship.tokenExpire = null;
      foundRelationship.statusId = friendStatus;

      foundRelationship
        .save()
        .then((updatedRelationship) => {
          if (!updatedRelationship)
            return StatusResponse(res, 500, "Cannot update friend request");

          // Now add the reciprocal relationship
          // Check to see if one already exists for some reason
          Friend.findOne({
            where: {
              userId: req.authUserId,
              friendId: foundRelationship.userId,
            },
          })
            .then((foundReciprocal) => {
              if (foundReciprocal) {
                foundReciprocal.statusId = friendStatus;
                return foundReciprocal.save();
              } else {
                const newReciprocal = new Friend();
                newReciprocal.creator = req.authUserId;
                newReciprocal.id = UUID("friend");
                newReciprocal.userId = req.authUserId;
                newReciprocal.friendId = foundRelationship.userId;
                newReciprocal.statusId = friendStatus;

                return newReciprocal.save();
              }
            })
            .then((addedReciprocal) => {
              if (!addedReciprocal)
                return StatusResponse(
                  res,
                  500,
                  "Cannot add reciprocal relationship"
                );
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.deleteFriendRequest = (req, res, next) => {
  const friendRequestToFind = req.params.requestId;
  let userToFind = req.params.userId;

  if (!friendRequestToFind)
    return StatusResponse(res, 421, "No request Id provided");
  if (!userToFind) {
    userToFind = req.authUserId;
  }

  const options = {};
  const whereCondition = {};
  whereCondition.id = friendRequestToFind;
  whereCondition.userId = userToFind;

  options.where = whereCondition;

  Friend.findOne(options)
    .then((foundRequest) => {
      if (!foundRequest) return StatusResponse(res, 404, "No request found");

      const recipientId = foundRequest.friendId;

      foundRequest
        .destroy()
        .then(async (deletedRequest) => {
          if (!deletedRequest)
            return StatusResponse(res, 500, "Cannot delete friend request");

          const notifWhere = {};
          notifWhere.senderId = userToFind;
          notifWhere.userId = recipientId;

          await Notification.destroy({ where: notifWhere });

          return StatusResponse(res, 200, "OK", { id: foundRequest.id });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

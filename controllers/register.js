const Util = require("util");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

const Config = require("../config/wotlwedu");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");

const User = require("../model/user");
const Role = require("../model/role");
const UserRole = require("../model/userrole");
const Organization = require("../model/organization");

const DEFAULT_ORGANIZATION_ID = "org_default";

exports.postRegisterUser = (req, res, next) => {
  if (
    !req.body.email ||
    !req.body.firstName ||
    !req.body.lastName ||
    !req.body.alias
  ) {
    return StatusResponse(res, 421, "Must provide all required fields");
  }

  const whereCondition = {
    [Op.or]: [{ email: req.body.email }, { alias: req.body.alias }],
  };

  // The email address must be unique
  User.findOne({ where: whereCondition })
    .then((foundUser) => {
      if (foundUser) {
        return StatusResponse(res, 500, "Unable to register user");
      }

      // Populate the user properties from the supplied data
      const userToRegister = new User();

      userToRegister.id = UUID("user");
      userToRegister.email = req.body.email;
      if (req.body.alias) userToRegister.alias = req.body.alias;
      if (req.body.firstName) userToRegister.firstName = req.body.firstName;
      if (req.body.lastName) userToRegister.lastName = req.body.lastName;
      const plainPassword =
        typeof req.body.password === "string"
          ? req.body.password
          : typeof req.body.auth === "string"
          ? req.body.auth
          : "";
      if (!plainPassword || plainPassword.length < 8) {
        return StatusResponse(res, 421, "Password must be at least 8 characters");
      }

      // Newly-registered users are marked inactive
      // until they confirm their account
      userToRegister.active = false;
      userToRegister.verified = false;

      if (req.authUser) {
        userToRegister.creator = req.authUser;
      } else {
        userToRegister.creator = userToRegister.id;
      }

      const requestedOrganizationId = req.body.organizationId || req.authOrganizationId || DEFAULT_ORGANIZATION_ID;
      userToRegister.organizationId = requestedOrganizationId;

      // Create a confirmation token to use in a
      // verification email
      userToRegister.registerToken = UUID("wotlwedu");
      userToRegister.registerTokenExpire = Date.now() + 3600000;

      // Ensure the organization exists before saving user registration
      Organization.findOne({ where: { id: userToRegister.organizationId } })
        .then(async (foundOrganization) => {
          if (!foundOrganization) {
            if (userToRegister.organizationId !== DEFAULT_ORGANIZATION_ID) {
              throw new Error("Organization not found");
            }
            await Organization.create({
              id: DEFAULT_ORGANIZATION_ID,
              name: "Default Organization",
              description: "Auto-created default tenant",
              active: true,
              creator: "system",
            });
          }
          return true;
        })
        .then(async () => {
          userToRegister.auth = await bcrypt.hash(plainPassword, 12);
          return userToRegister.save();
        })
        .then((result) => {
          if (!result) StatusResponse(res, 500, "Unable to register user");
          Mailer.sendEmailConfirmMessage(
            userToRegister.email,
            userToRegister.registerToken,
            Config.baseFrontendUrl
          )
            .catch((err) => {
              return StatusResponse(
                res,
                421,
                "Failed to send confirmation email: " + err
              );
            })
            .then(() => {
              const defaultRoleName = Config.defaultRoleName || "Default Role";
              // Must add the user to a default role
              Role.findOne({ where: { name: defaultRoleName } })
                .then((foundRole) => {
                  if (!foundRole)
                    return StatusResponse(
                      res,
                      421,
                      "No default role is available"
                    );

                  userToRegister
                    .addRole(foundRole, { through: { id: UUID("userrole") } })
                    .then(() => {
                      return StatusResponse(res, 200, "OK", {
                        organizationId: userToRegister.organizationId,
                      });
                    })
                    .catch((err) => next(err));
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => {
          if (err && err.message === "Organization not found") {
            return StatusResponse(res, 421, "Organization not found");
          }
          next(err);
        });
    })
    .catch((err) => {
      next(err);
    });
};

exports.getConfirmRegistration = (req, res, next) => {
  const tokenToFind = req.params.tokenId;

  if (!tokenToFind) return StatusResponse(res, 421, "No token ID provided");

  User.findOne({
    where: {
      registerToken: tokenToFind,
      registerTokenExpire: { [Op.gte]: Date.now() },
    },
  })
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      foundUser.active = true;
      foundUser.verified = true;
      foundUser.registerToken = null;
      foundUser.registerTokenExpire = null;

      /* If the email address is being changed and we received a confirmation 
      then it came from the original email address owner so we can change it */
      if (foundUser.changeToEmail !== null) {
        foundUser.email = foundUser.changeToEmail;
        foundUser.changeToEmail = null;
      }

      foundUser
        .save()
        .then((activatedUser) => {
          if (!activatedUser)
            return StatusResponse(res, 500, "Cannot activate user");

          Mailer.sendEmailChangeCompleteMessage(
            foundUser.email,
            Config.baseFrontendUrl
          )
            .then((success) => {
              return StatusResponse(res, 200, "OK", {
                email: foundUser.email,
              });
            })
            .catch((err) => {
              return StatusResponse(
                res,
                421,
                "Failed to send email change completion message: " + err
              );
            });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

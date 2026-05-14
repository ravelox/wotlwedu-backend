const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

const Config = require("../config/wotlwedu");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");
const database = require("../util/database");

const User = require("../model/user");
const Role = require("../model/role");
const UserRole = require("../model/userrole");
const Organization = require("../model/organization");
const Workgroup = require("../model/workgroup");
const WorkgroupMember = require("../model/workgroupmember");
const Preference = require("../model/preference");

const TUTORIAL_PREFERENCE_NAME = "tutorial.poll.create";

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeName(name) {
  return typeof name === "string" ? name.trim() : "";
}

function slugifyAlias(value) {
  const normalized = normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
  return normalized || "wotlwedu.user";
}

function buildTutorialSession() {
  const suffix = UUID("tutorial").split("_").pop().slice(0, 6).toUpperCase();
  return {
    version: 1,
    status: "active",
    startedAt: new Date().toISOString(),
    skippedAt: null,
    dismissedAt: null,
    names: {
      listName: `Tutorial Ideas ${suffix}`,
      groupName: `Tutorial Circle ${suffix}`,
      electionName: `Tutorial Poll ${suffix}`,
    },
    bindings: {
      listId: null,
      groupId: null,
      electionId: null,
    },
  };
}

async function resolveUniqueAlias(seed) {
  const baseAlias = slugifyAlias(seed);
  const candidates = [
    baseAlias,
    `${baseAlias}.${UUID("alias").split("_").pop().slice(0, 6).toLowerCase()}`,
    `user.${UUID("alias").split("_").pop().slice(0, 10).toLowerCase()}`,
  ];

  for (const candidate of candidates) {
    const existing = await User.findOne({ where: { alias: candidate }, attributes: ["id"] });
    if (!existing) return candidate;
  }

  return `user.${Date.now().toString(36)}`;
}

async function resolveUniqueOrganizationName(seed) {
  const baseName = normalizeName(seed) || "Personal Wotlwedu";
  const candidates = [
    baseName,
    `${baseName} ${UUID("org").split("_").pop().slice(0, 6).toUpperCase()}`,
  ];

  for (const candidate of candidates) {
    const existing = await Organization.findOne({ where: { name: candidate }, attributes: ["id"] });
    if (!existing) return candidate;
  }

  return `${baseName} ${Date.now().toString(36).toUpperCase()}`;
}

exports.postRegisterUser = (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const firstName = normalizeName(req.body.firstName);
  const lastName = normalizeName(req.body.lastName) || "User";

  if (!email || !firstName) {
    return StatusResponse(res, 421, "Must provide all required fields");
  }

  // The email address must be unique
  User.findOne({ where: { email } })
    .then(async (foundUser) => {
      if (foundUser) {
        return StatusResponse(res, 500, "Unable to register user");
      }

      const defaultRoleName = Config.defaultRoleName || "Default Role";
      const foundRole = await Role.findOne({ where: { name: defaultRoleName } });
      if (!foundRole) {
        return StatusResponse(res, 421, "No default role is available");
      }

      const plainPassword =
        typeof req.body.password === "string"
          ? req.body.password
          : typeof req.body.auth === "string"
            ? req.body.auth
            : "";
      if (!plainPassword || plainPassword.length < 8) {
        return StatusResponse(res, 421, "Password must be at least 8 characters");
      }

      const userId = UUID("user");
      const organizationId = UUID("org");
      const workgroupId = UUID("space");
      const alias = await resolveUniqueAlias(req.body.alias || email.split("@")[0] || firstName);
      const organizationName = await resolveUniqueOrganizationName(
        req.body.organizationName || `${firstName}'s Wotlwedu`
      );
      const spaceName = normalizeName(req.body.spaceName) || "My Space";

      // Populate the user properties from consumer signup data
      const userToRegister = new User();

      userToRegister.id = userId;
      userToRegister.email = email;
      userToRegister.alias = alias;
      userToRegister.firstName = firstName;
      userToRegister.lastName = lastName;

      // Newly-registered users are marked inactive
      // until they confirm their account
      userToRegister.active = false;
      userToRegister.verified = false;
      userToRegister.organizationAdmin = true;
      userToRegister.workgroupAdmin = true;
      userToRegister.adminWorkgroupId = workgroupId;

      userToRegister.creator = userToRegister.id;
      userToRegister.organizationId = organizationId;

      // Create a confirmation token to use in a
      // verification email
      userToRegister.registerToken = UUID("wotlwedu");
      userToRegister.registerTokenExpire = Date.now() + 3600000;

      userToRegister.auth = await bcrypt.hash(plainPassword, 12);

      database.transaction(async (transaction) => {
        await Organization.create(
          {
            id: organizationId,
            name: organizationName,
            description: "Personal Wotlwedu space",
            active: true,
            creator: userId,
          },
          { transaction }
        );
        await userToRegister.save({ transaction });
        await Workgroup.create(
          {
            id: workgroupId,
            name: spaceName,
            description: "Your first personal space",
            organizationId,
            active: true,
            creator: userId,
          },
          { transaction }
        );
        await WorkgroupMember.create(
          {
            id: UUID("spacemember"),
            workgroupId,
            userId,
            active: true,
            creator: userId,
          },
          { transaction }
        );
        await UserRole.create(
          {
            id: UUID("userrole"),
            userId,
            roleId: foundRole.id,
          },
          { transaction }
        );
        await Preference.create(
          {
            id: UUID("pref"),
            name: TUTORIAL_PREFERENCE_NAME,
            value: JSON.stringify(buildTutorialSession()),
            creator: userId,
          },
          { transaction }
        );
      })
        .then((result) => {
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
              return StatusResponse(res, 200, "OK", {
                organizationId,
                workgroupId,
                onboarding: {
                  firstSpaceCreated: true,
                  pollTutorialStarted: true,
                },
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
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

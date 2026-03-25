const Util = require("util");
const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { Op } = require("sequelize");
const OTPAuth = require("otpauth");
const QRCode = require("qrcode");

const Config = require("../config/wotlwedu");

const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");
const Helpers = require("../util/helpers");
const database = require("../util/database");

const Organization = require("../model/organization");
const OrganizationInvite = require("../model/organizationinvite");
const Role = require("../model/role");
const SocialIdentity = require("../model/socialidentity");
const User = require("../model/user");
const UserRole = require("../model/userrole");
const TestToken = require("../model/testtoken");

let googleOAuthClient = null;
const SOCIAL_LINK_TOKEN_EXPIRY = "10m";

async function generateJWTAndSave(foundUser) {
  if (!foundUser) return null;

  // Generate a new UUID for the refresh token to sign
  const refreshTokenId = UUID("wotlwedu");

  const authTokenContents = { user: foundUser.id };
  const refreshTokenContents = { user: foundUser.id, token: refreshTokenId };

  // Save the refresh token to the user record
  foundUser.refreshToken = refreshTokenId;
  foundUser.refreshTokenExpire = Date.now() + 3600000;
  // Record the last login time
  foundUser.lastLogin = Date.now();

  await foundUser.save().then((userUpdated) => {
    if (!userUpdated) {
      throw new Error("Cannot save refresh token");
    }
  });

  const newAuthToken = JWT.sign(authTokenContents, Config.jwtSecret, {
    expiresIn: Config.jwtExpiry,
  });
  const newRefreshToken = JWT.sign(refreshTokenContents, Config.jwtSecret, {
    expiresIn: Config.jwtRefreshExpiry,
  });

  return { authToken: newAuthToken, refreshToken: newRefreshToken };
}

function buildAuthResponse(foundUser, tokens, extras = {}) {
  return {
    userId: foundUser.id,
    firstName: foundUser.firstName,
    lastName: foundUser.lastName,
    email: foundUser.email,
    alias: foundUser.alias,
    admin: foundUser.admin,
    systemAdmin: foundUser.systemAdmin === true || foundUser.admin === true,
    organizationId: foundUser.organizationId || null,
    organizationAdmin: foundUser.organizationAdmin === true,
    workgroupAdmin: foundUser.workgroupAdmin === true,
    adminWorkgroupId:
      foundUser.adminWorkgroupId || foundUser.adminGroupId || null,
    authToken: tokens.authToken,
    refreshToken: tokens.refreshToken,
    ...extras,
  };
}

function parseTokenDurationMinutes(input) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1) return null;
  if (parsed > 60 * 24 * 30) return null; // Max 30 days for testing tokens
  return parsed;
}

exports._parseTokenDurationMinutes = parseTokenDurationMinutes;

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== "string") return "";
  return provider.trim().toLowerCase();
}

function buildProvisionedOrganizationName(firstName, lastName) {
  const firstInitial = (firstName || "").trim().charAt(0).toUpperCase();
  const lastInitial = (lastName || "").trim().charAt(0).toUpperCase();
  return `${firstInitial} ${lastInitial}'s Organization`;
}

function getGoogleOAuthClient() {
  if (!Config.googleClientId) return null;
  if (!googleOAuthClient) {
    googleOAuthClient = new OAuth2Client(Config.googleClientId);
  }
  return googleOAuthClient;
}

function splitDisplayName(displayName) {
  const value = (displayName || "").toString().trim();
  if (!value) return { firstName: "", lastName: "" };

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "User" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function generateUniqueAlias(baseAlias, transaction) {
  const fallback = "user";
  const normalized = (baseAlias || fallback)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".");
  const safeBase = normalized.replace(/^\.+|\.+$/g, "") || fallback;

  let candidate = safeBase;
  let counter = 1;

  while (true) {
    const existing = await User.findOne({
      where: { alias: candidate },
      transaction,
    });
    if (!existing) return candidate;
    counter += 1;
    candidate = `${safeBase}.${counter}`;
  }
}

async function addDefaultRoleToUser(user, transaction) {
  const defaultRoleName = Config.defaultRoleName || "Default Role";
  const foundRole = await Role.findOne({
    where: { name: defaultRoleName },
    transaction,
  });

  if (!foundRole) throw new Error("No default role is available");

  const existingRole = await UserRole.findOne({
    where: { userId: user.id, roleId: foundRole.id },
    transaction,
  });
  if (existingRole) return;

  await UserRole.create(
    {
      id: UUID("userrole"),
      userId: user.id,
      roleId: foundRole.id,
      creator: user.creator || user.id,
    },
    { transaction }
  );
}

async function resolveInviteByToken(inviteToken, transaction) {
  const normalizedToken = (inviteToken || "").toString().trim();
  if (!normalizedToken) return null;

  const invite = await OrganizationInvite.findOne({
    where: { token: normalizedToken, acceptedAt: null },
    transaction,
  });
  if (!invite) return null;
  if (invite.revokedAt) return null;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    return null;
  }

  const organization = await Organization.findByPk(invite.organizationId, { transaction });
  if (!organization || organization.active === false) return null;

  return { invite, organization };
}

function buildSocialLinkToken(payload) {
  return JWT.sign(
    {
      type: "social-link",
      provider: normalizeProvider(payload.provider),
      subject: payload.subject,
      email: normalizeEmail(payload.email),
      userId: payload.userId,
      inviteToken: payload.inviteToken || null,
    },
    Config.jwtSecret,
    { expiresIn: SOCIAL_LINK_TOKEN_EXPIRY }
  );
}

function decodeSocialLinkToken(token) {
  const decoded = JWT.verify(token, Config.jwtSecret);
  if (!decoded || decoded.type !== "social-link") {
    throw new Error("Invalid social link token");
  }
  return decoded;
}

async function findOrProvisionSocialUser(payload) {
  const provider = normalizeProvider(payload.provider);
  const subject = (payload.subject || "").toString().trim();
  const email = normalizeEmail(payload.email);
  const firstName = (payload.firstName || "").toString().trim();
  const lastName = (payload.lastName || "").toString().trim();
  const requestedAlias = (payload.alias || "").toString().trim();
  const inviteToken = (payload.inviteToken || "").toString().trim();

  if (!provider || !subject || !email || !firstName || !lastName) {
    throw new Error("Must provide provider, subject, email, firstName, and lastName");
  }

  return await database.transaction(async (transaction) => {
    let user = null;
    let provisionedOrganizationId = null;
    let consumedInviteId = null;
    let isNewUser = false;
    let linkRequired = false;
    let linkToken = null;

    const existingIdentity = await SocialIdentity.findOne({
      where: { provider, subject },
      transaction,
    });

    if (existingIdentity) {
      user = await User.findByPk(existingIdentity.userId, { transaction });
      if (!user) throw new Error("Linked user not found for social identity");
      if (existingIdentity.email !== email) {
        existingIdentity.email = email;
        await existingIdentity.save({ transaction });
      }
    } else {
      user = await User.findOne({
        where: { email },
        transaction,
      });

      if (user) {
        if (!user.active) throw new Error("Account disabled");

        const existingProviderIdentity = await SocialIdentity.findOne({
          where: { userId: user.id, provider },
          transaction,
        });

        if (existingProviderIdentity) {
          throw new Error(`Account already linked to a different ${provider} sign-in`);
        }

        linkRequired = true;
        linkToken = buildSocialLinkToken({
          provider,
          subject,
          email,
          userId: user.id,
          inviteToken,
        });
      } else {
        isNewUser = true;
        const userId = UUID("user");
        const invited = await resolveInviteByToken(inviteToken, transaction);

        let organizationId;
        let organizationAdmin = false;
        if (invited) {
          if (normalizeEmail(invited.invite.email) !== email) {
            throw new Error("Invite email does not match Google account");
          }
          organizationId = invited.organization.id;
          consumedInviteId = invited.invite.id;
          invited.invite.acceptedAt = new Date();
          invited.invite.acceptedByUserId = userId;
          await invited.invite.save({ transaction });
        } else {
          const provisionedOrganization = await Organization.create(
            {
              id: UUID("org"),
              name: buildProvisionedOrganizationName(firstName, lastName),
              description: "Auto-provisioned from first social sign-in",
              active: true,
              creator: userId,
            },
            { transaction }
          );
          organizationId = provisionedOrganization.id;
          provisionedOrganizationId = provisionedOrganization.id;
          organizationAdmin = true;
        }

        const alias = await generateUniqueAlias(
          requestedAlias || email.split("@")[0] || `${firstName}.${lastName}`,
          transaction
        );

        user = await User.create(
          {
            id: userId,
            firstName,
            lastName,
            alias,
            email,
            organizationId,
            creator: userId,
            active: true,
            verified: true,
            organizationAdmin,
            auth: null,
          },
          { transaction }
        );

        await SocialIdentity.create(
          {
            id: UUID("social"),
            userId: user.id,
            provider,
            subject,
            email,
            creator: user.id,
          },
          { transaction }
        );
        await addDefaultRoleToUser(user, transaction);
      }
    }

    if (!user.active) throw new Error("Account disabled");

    return {
      user,
      isNewUser,
      provisionedOrganizationId,
      consumedInviteId,
      linkRequired,
      linkToken,
    };
  });
}

async function confirmSocialLink(linkToken) {
  const decoded = decodeSocialLinkToken(linkToken);

  return await database.transaction(async (transaction) => {
    const provider = normalizeProvider(decoded.provider);
    const subject = (decoded.subject || "").toString().trim();
    const userId = (decoded.userId || "").toString().trim();
    const email = normalizeEmail(decoded.email);

    if (!provider || !subject || !userId || !email) {
      throw new Error("Invalid social link token");
    }

    const user = await User.findByPk(userId, { transaction });
    if (!user) throw new Error("User not found");
    if (!user.active) throw new Error("Account disabled");

    const existingIdentity = await SocialIdentity.findOne({
      where: { provider, subject },
      transaction,
    });
    if (existingIdentity && existingIdentity.userId !== user.id) {
      throw new Error("Social identity already linked to another account");
    }
    if (!existingIdentity) {
      const existingProviderIdentity = await SocialIdentity.findOne({
        where: { userId: user.id, provider },
        transaction,
      });
      if (existingProviderIdentity && existingProviderIdentity.subject !== subject) {
        throw new Error(`Account already linked to a different ${provider} sign-in`);
      }

      await SocialIdentity.create(
        {
          id: UUID("social"),
          userId: user.id,
          provider,
          subject,
          email,
          creator: user.creator || user.id,
        },
        { transaction }
      );
    } else if (existingIdentity.email !== email) {
      existingIdentity.email = email;
      await existingIdentity.save({ transaction });
    }

    return { user, linkedProvider: provider };
  });
}

async function verifyGoogleIdToken(idToken) {
  const client = getGoogleOAuthClient();
  if (!client) throw new Error("Google sign-in is not configured");
  if (!idToken || typeof idToken !== "string") {
    throw new Error("No Google ID token provided");
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: Config.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Invalid Google ID token");
  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  if (!payload.sub || !payload.email) {
    throw new Error("Google token missing required identity claims");
  }

  const derivedName = splitDisplayName(payload.name);

  return {
    provider: "google",
    subject: payload.sub,
    email: payload.email,
    firstName: payload.given_name || derivedName.firstName,
    lastName: payload.family_name || derivedName.lastName,
    alias: payload.email.split("@")[0],
  };
}

exports.getInviteStatus = async (req, res, next) => {
  try {
    const inviteToken = req.params.token;
    if (!inviteToken) return StatusResponse(res, 421, "No invite token provided");

    const resolved = await resolveInviteByToken(inviteToken, null);
    if (!resolved) return StatusResponse(res, 404, "Invite not found");

    return StatusResponse(res, 200, "OK", {
      invite: {
        token: resolved.invite.token,
        email: resolved.invite.email,
        organizationId: resolved.organization.id,
        organizationName: resolved.organization.name,
        expiresAt: resolved.invite.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.postLogin = async (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;

  if (!email || !password) {
    return StatusResponse(res, 403, "Invalid credentials");
  }

  User.findOne({ where: { email: email } })
    .then((foundUser) => {
      if (!foundUser) {
        return StatusResponse(res, 403, "Invalid credentials");
      }

      // Prevent login for inactive accounts
      if (!foundUser.active) {
        return StatusResponse(res, 403, "Account disabled");
      }

      if (!foundUser.auth)
        return StatusResponse(res, 403, "Invalid credentials");
      if (foundUser.auth === "")
        return StatusResponse(res, 403, "Invalid credentials");

      bcrypt
        .compare(password, foundUser.auth)
        .then(async (passwordMatch) => {
          if (!passwordMatch) {
            return StatusResponse(res, 403, "Invalid credentials");
          }
          /* If 2FA has been enabled, generate a verification token so that the app has to call the verification with both the token and the 2FA credentials */
          if (foundUser.enable2fa) {
            foundUser.token2fa = UUID("wotlwedu");
            foundUser
              .save()
              .then((userUpdated) => {
                if (!userUpdated)
                  return StatusResponse(
                    500,
                    "Cannot update user with pending 2FA"
                  );
                /* Now tell the calling app to redirect to the verification */
                return StatusResponse(res, 302, "2FA Enabled", {
                  toURL:
                    "/auth/verify/" + foundUser.id + "/" + foundUser.token2fa,
                });
              })
              .catch((err) => next(err));
          } else {
            const tokens = await generateJWTAndSave(foundUser);
            return StatusResponse(res, 200, "OK", {
              userId: foundUser.id,
              firstName: foundUser.firstName,
              lastName: foundUser.lastName,
              email: foundUser.email,
              alias: foundUser.alias,
              admin: foundUser.admin,
              systemAdmin: foundUser.systemAdmin === true || foundUser.admin === true,
              organizationId: foundUser.organizationId || null,
              organizationAdmin: foundUser.organizationAdmin === true,
              workgroupAdmin: foundUser.workgroupAdmin === true,
              adminWorkgroupId:
                foundUser.adminWorkgroupId || foundUser.adminGroupId || null,
              authToken: tokens.authToken,
              refreshToken: tokens.refreshToken,
            });
          }
        })
        .catch((err) => {
          next(err);
        });
    })
    .catch((err) => next(err));
};

exports.postSocialLogin = async (req, res, next) => {
  try {
    const result = await findOrProvisionSocialUser(req.body || {});
    if (result.linkRequired) {
      return StatusResponse(res, 200, "Confirmation required", {
        linkRequired: true,
        linkToken: result.linkToken,
        provider: normalizeProvider(req.body?.provider),
      });
    }
    const tokens = await generateJWTAndSave(result.user);
    return StatusResponse(
      res,
      200,
      "OK",
      buildAuthResponse(result.user, tokens, {
        isNewUser: result.isNewUser,
        provisionedOrganizationId: result.provisionedOrganizationId,
        consumedInviteId: result.consumedInviteId,
      })
    );
  } catch (err) {
    if (err && err.message === "Account disabled") {
      return StatusResponse(res, 403, "Account disabled");
    }
    if (
      err &&
      [
        "Must provide provider, subject, email, firstName, and lastName",
        "Invite email does not match Google account",
        "No default role is available",
        "Account already linked to a different google sign-in",
      ].includes(err.message)
    ) {
      return StatusResponse(res, 421, err.message);
    }
    next(err);
  }
};

exports.postGoogleLogin = async (req, res, next) => {
  try {
    const googleProfile = await verifyGoogleIdToken(req.body?.idToken);
    if (req.body?.inviteToken) {
      googleProfile.inviteToken = req.body.inviteToken;
    }
    const result = await findOrProvisionSocialUser(googleProfile);
    if (result.linkRequired) {
      return StatusResponse(res, 200, "Confirmation required", {
        linkRequired: true,
        linkToken: result.linkToken,
        provider: "google",
      });
    }
    const tokens = await generateJWTAndSave(result.user);
    return StatusResponse(
      res,
      200,
      "OK",
      buildAuthResponse(result.user, tokens, {
        isNewUser: result.isNewUser,
        provisionedOrganizationId: result.provisionedOrganizationId,
        consumedInviteId: result.consumedInviteId,
      })
    );
  } catch (err) {
    if (
      err &&
      [
        "Google sign-in is not configured",
        "No Google ID token provided",
        "Invalid Google ID token",
        "Google account email is not verified",
        "Google token missing required identity claims",
        "Invite email does not match Google account",
        "No default role is available",
        "Account already linked to a different google sign-in",
      ].includes(err.message)
    ) {
      return StatusResponse(res, 421, err.message);
    }
    next(err);
  }
};

exports.postConfirmSocialLink = async (req, res, next) => {
  try {
    const linkToken = (req.body?.linkToken || "").toString().trim();
    if (!linkToken) return StatusResponse(res, 421, "No social link token provided");

    const result = await confirmSocialLink(linkToken);
    const tokens = await generateJWTAndSave(result.user);
    return StatusResponse(
      res,
      200,
      "OK",
      buildAuthResponse(result.user, tokens, {
        linkedProvider: result.linkedProvider,
      })
    );
  } catch (err) {
    if (
      err &&
      [
        "No social link token provided",
        "Invalid social link token",
        "Social identity already linked to another account",
        "Account already linked to a different google sign-in",
      ].includes(err.message)
    ) {
      return StatusResponse(res, 421, err.message);
    }
    if (err && err.message === "Account disabled") {
      return StatusResponse(res, 403, "Account disabled");
    }
    next(err);
  }
};

exports._buildProvisionedOrganizationName = buildProvisionedOrganizationName;
exports._splitDisplayName = splitDisplayName;

exports.postRefreshLogin = async (req, res, next) => {
  const refreshToken = req.body.refreshToken;

  if (!refreshToken)
    return StatusResponse(res, 403, "No refresh token provided");

  let decoded;
  try {
    decoded = JWT.verify(refreshToken, Config.jwtSecret);
  } catch (err) {
    return StatusResponse(res, 403, "Invalid reset token", {
      message: err.name,
    });
  }

  User.findByPk(decoded.user).then(async (foundUser) => {
    if (!foundUser) return StatusResponse(res, 421, "Invalid credentials");

    if (decoded.token !== foundUser.refreshToken)
      return StatusResponse(res, 403, "Invalid credentials");

    const tokens = await generateJWTAndSave(foundUser);

        return StatusResponse(res, 200, "OK", {
      userId: foundUser.id,
      firstName: foundUser.firstName,
      lastName: foundUser.lastName,
      email: foundUser.email,
      alias: foundUser.alias,
      admin: foundUser.admin,
      systemAdmin: foundUser.systemAdmin === true || foundUser.admin === true,
      organizationId: foundUser.organizationId || null,
      organizationAdmin: foundUser.organizationAdmin === true,
      workgroupAdmin: foundUser.workgroupAdmin === true,
      adminWorkgroupId:
        foundUser.adminWorkgroupId || foundUser.adminGroupId || null,
      authToken: tokens.authToken,
      refreshToken: tokens.refreshToken,
    });
  });
};

exports.postRequestPasswordReset = (req, res, next) => {
  const emailToFind = req.body.email;
  if (!emailToFind)
    return StatusResponse(res, 421, "No email address provided");

  User.findOne({ where: { email: emailToFind } })
    .then((foundUser) => {
      if (!foundUser) {
        // Do not disclose whether the account exists.
        return StatusResponse(res, 200, "OK");
      }

      foundUser.resetToken = UUID("wotlwedu");
      foundUser.resetTokenExpire = Date.now() + 3600000;
      foundUser.save().then((result) => {
        if (!result)
          return StatusResponse(res, 500, "No reset token generated");

        Mailer.sendPasswordResetMessage(
          foundUser.email,
          foundUser.id,
          foundUser.resetToken,
          Config.baseFrontendUrl
        )
          .then(() => {
            return StatusResponse(res, 200, "OK");
          })
          .catch((err) => {
            return StatusResponse(
              res,
              421,
              "Failed to send reset email: " + err
            );
          });
      });
    })
    .catch((err) => next(err));
};

// Actual password reset
// Use the token to confirm that the request is valid
// The calling app MUST bcrypt the password
exports.putResetUserPassword = (req, res, next) => {
  const userToFind = req.params.userid;
  const resetToken = req.body.resetToken;
  const newPassword = req.body.newPassword;

  if (!userToFind) return StatusResponse(res, 421, "No user ID provided");
  if (!resetToken) return StatusResponse(res, 421, "No reset token provided");
  if (!newPassword) return StatusResponse(res, 421, "No password provided");

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return StatusResponse(res, 421, "Password must be at least 8 characters");
  }

  User.findOne({
    where: {
      id: userToFind,
      resetToken: resetToken,
      resetTokenExpire: { [Op.gte]: Date.now() },
    },
  })
    .then(async (foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      foundUser.resetToken = null;
      foundUser.resetTokenExpire = null;
      foundUser.active = 1;
      foundUser.auth = await bcrypt.hash(newPassword, 12);

      foundUser
        .save()
        .then((updatedPassword) => {
          if (!updatedPassword)
            return StatusResponse(res, 500, "Cannot update password");
          return StatusResponse(res, 200, "OK");
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.enable2FA = (req, res, next) => {
  if (!req.authUserId) return StatusResponse(res, 421, "No authenticated user");
  const secret = Helpers.genBase32();

  User.findByPk(req.authUserId)
    .then((foundUser) => {
      if (!foundUser)
        return StatusResponse(res, 404, "Authenticated user not found");

      if (foundUser.enable2fa) {
        return StatusResponse(res, 421, "2FA is already enabled");
      }

      /* Add secret to user record */
      foundUser.secret2fa = secret;
      foundUser.token2fa = UUID("wotlwedu");

      foundUser
        .save()
        .then((userUpdated) => {
          if (!userUpdated)
            return StatusResponse(res, 500, "Cannot update user secret");

          let totp = new OTPAuth.TOTP({
            issuer: "Wotlwedu",
            label: foundUser.email,
            algorithm: "SHA1",
            digits: 6,
            secret: secret,
          });

          let otpauth_url = totp.toString();

          // Generate and send the QR code as a response
          QRCode.toDataURL(otpauth_url, (err, url) => {
            if (err) {
              return StatusResponse(500, "Cannot generate QR Code");
            }
            return StatusResponse(res, 200, "OK", {
              secret: secret,
              QRCode: url,
              verificationToken: foundUser.token2fa,
            });
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.getGenerate2FAVerification = (req, res, next) => {
  if (!req.authUserId) return StatusResponse(res, 401, "Not authenticated");

  User.findByPk(req.authUserId)
    .then((foundUser) => {
      foundUser.token2fa = UUID("wotlwedu");
      foundUser
        .save()
        .then((userUpdated) => {
          if (!userUpdated)
            return StatusResponse(500, "Cannot update user with pending 2FA");
          /* Now tell the calling app to redirect to the verification */
          return StatusResponse(res, 200, "OK", { token: foundUser.token2fa });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

exports.verify2FA = (req, res, next) => {
  const authToken = req.body.authToken;
  const verificationToken = req.body.verificationToken;
  let userToFind = req.body.userId;

  if (!userToFind) {
    if (!req.authUserId)
      return StatusResponse(res, 421, "No authenticated user");
    userToFind = req.authUserId;
  }

  if (!userToFind) {
    return StatusResponse(res, 421, "No user ID provided");
  }

  /* Find the user and make sure the correct verification token has been provided by the app */
  User.findOne({
    where: { id: userToFind, token2fa: verificationToken },
  }).then(async (foundUser) => {
    if (!foundUser) return StatusResponse(res, 421, "Invalid credentials");

    if (!foundUser.secret2fa)
      return StatusResponse(res, 421, "User has no 2FA secret configured");

    let totp = new OTPAuth.TOTP({
      issuer: "Wotlwedu",
      label: foundUser.email,
      algorithm: "SHA1",
      digits: 6,
      secret: foundUser.secret2fa,
    });

    let verified = totp.validate({ token: authToken, window: 1 });
    if (verified === null)
      return StatusResponse(res, 421, "Invalid credentials");

    const tokens = await generateJWTAndSave(foundUser);

    foundUser.token2fa = null;
    foundUser.save().then((updatedUser) => {
      if (!updatedUser)
        return StatusResponse(res, 500, "Cannot clear pending 2FA");
      return StatusResponse(res, 200, "OK", {
        userId: foundUser.id,
        firstName: foundUser.firstName,
        lastName: foundUser.lastName,
        email: foundUser.email,
        alias: foundUser.alias,
        admin: foundUser.admin,
        systemAdmin: foundUser.systemAdmin === true || foundUser.admin === true,
        organizationId: foundUser.organizationId || null,
        organizationAdmin: foundUser.organizationAdmin === true,
        workgroupAdmin: foundUser.workgroupAdmin === true,
        adminWorkgroupId:
          foundUser.adminWorkgroupId || foundUser.adminGroupId || null,
        authToken: tokens.authToken,
        refreshToken: tokens.refreshToken,
      });
    });
  });
};

exports.postGenerateTestBearer = async (req, res, next) => {
  try {
    if (req.isSystemAdmin !== true) {
      return StatusResponse(res, 403, "System admin required");
    }

    const userId = req.body.userId;
    const durationMinutes = parseTokenDurationMinutes(req.body.expiresInMinutes);

    if (!userId) {
      return StatusResponse(res, 421, "No target user ID provided");
    }
    if (!durationMinutes) {
      return StatusResponse(
        res,
        421,
        "expiresInMinutes must be an integer between 1 and 43200"
      );
    }

    const targetUser = await User.findByPk(userId, {
      attributes: [
        "id",
        "firstName",
        "lastName",
        "email",
        "alias",
        "active",
        "admin",
        "systemAdmin",
        "organizationId",
        "organizationAdmin",
        "workgroupAdmin",
        "adminWorkgroupId",
        "adminGroupId",
      ],
    });

    if (!targetUser) return StatusResponse(res, 404, "Target user not found");
    if (!targetUser.active) return StatusResponse(res, 421, "Target user is inactive");

    const expiresInSeconds = durationMinutes * 60;
    const tokenId = UUID("wotlwedu");
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const authToken = JWT.sign(
      { user: targetUser.id, kind: "test", jti: tokenId },
      Config.jwtSecret,
      {
        expiresIn: expiresInSeconds,
      }
    );

    await TestToken.create({
      id: tokenId,
      userId: targetUser.id,
      creatorId: req.authUserId,
      expiresAt: expiresAt,
      revokedAt: null,
    });

    return StatusResponse(res, 200, "OK", {
      tokenId: tokenId,
      kind: "test",
      userId: targetUser.id,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      email: targetUser.email,
      alias: targetUser.alias,
      admin: targetUser.admin,
      systemAdmin: targetUser.systemAdmin === true || targetUser.admin === true,
      organizationId: targetUser.organizationId || null,
      organizationAdmin: targetUser.organizationAdmin === true,
      workgroupAdmin: targetUser.workgroupAdmin === true,
      adminWorkgroupId:
        targetUser.adminWorkgroupId || targetUser.adminGroupId || null,
      authToken: authToken,
      expiresInMinutes: durationMinutes,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
};

exports.postRevokeTestBearer = async (req, res, next) => {
  try {
    const tokenId = req.body.tokenId;
    if (!tokenId) {
      return StatusResponse(res, 421, "No token ID provided");
    }

    const foundToken = await TestToken.findByPk(tokenId);
    if (!foundToken) {
      return StatusResponse(res, 404, "Test token not found");
    }

    if (req.isSystemAdmin !== true && foundToken.userId !== req.authUserId) {
      return StatusResponse(res, 403, "Not authorized to revoke this token");
    }

    if (foundToken.revokedAt) {
      return StatusResponse(res, 200, "OK", {
        tokenId: foundToken.id,
        revokedAt: foundToken.revokedAt,
      });
    }

    foundToken.revokedAt = new Date();
    await foundToken.save();

    return StatusResponse(res, 200, "OK", {
      tokenId: foundToken.id,
      revokedAt: foundToken.revokedAt,
    });
  } catch (err) {
    return next(err);
  }
};

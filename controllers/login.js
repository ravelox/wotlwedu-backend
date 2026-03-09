const Util = require("util");
const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { Op } = require("sequelize");
const OTPAuth = require("otpauth");
const QRCode = require("qrcode");

const Config = require("../config/wotlwedu");

const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const Mailer = require("../util/mailer");
const Helpers = require("../util/helpers");

const User = require("../model/user");
const TestToken = require("../model/testtoken");

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

function parseTokenDurationMinutes(input) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1) return null;
  if (parsed > 60 * 24 * 30) return null; // Max 30 days for testing tokens
  return parsed;
}

exports._parseTokenDurationMinutes = parseTokenDurationMinutes;

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
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      foundUser.resetToken = UUID("wotlwedu");
      foundUser.resetTokenExpire = Date.now() + 3600000;
      foundUser.save().then((result) => {
        if (!result)
          return StatusResponse(res, 500, "No reset token generated");

        Mailer.sendPasswordResetMessage(
          foundUser.email,
          foundUser.id,
          foundUser.resetToken,
          req.headers.origin || Config.baseFrontendUrl
        )
          .then((success) => {
            return StatusResponse(res, 200, "OK", {
              resetToken: foundUser.resetToken,
            });
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

  User.findOne({
    where: {
      id: userToFind,
      resetToken: resetToken,
      resetTokenExpire: { [Op.gte]: Date.now() },
    },
  })
    .then((foundUser) => {
      if (!foundUser) return StatusResponse(res, 404, "User not found");

      foundUser.resetToken = null;
      foundUser.resetTokenExpire = null;
      foundUser.active = 1;
      foundUser.auth = newPassword;

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
              foundUser: foundUser,
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

const Util = require("util");
const bcrypt = require("bcryptjs");
const Crypto = require("crypto");
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
const AuthAudit = require("../util/auth-audit");

const Organization = require("../model/organization");
const OrganizationInvite = require("../model/organizationinvite");
const Role = require("../model/role");
const SocialIdentity = require("../model/socialidentity");
const User = require("../model/user");
const UserRole = require("../model/userrole");
const TestToken = require("../model/testtoken");
const Session = require("../model/session");

let googleOAuthClient = null;
const SOCIAL_LINK_TOKEN_EXPIRY = "10m";

function getRequestUserAgent(req) {
  return (req?.get?.("User-Agent") || "").toString().trim() || null;
}

function getRequestIp(req) {
  return (
    req?.ip ||
    req?.headers?.["x-forwarded-for"] ||
    req?.connection?.remoteAddress ||
    ""
  )
    .toString()
    .split(",")[0]
    .trim();
}

function hashRefreshTokenId(tokenId) {
  return Crypto.createHash("sha256").update(String(tokenId || "")).digest("hex");
}

function getBearerToken(req) {
  const authHeader = req.get?.("Authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return authHeader.trim();
}

function getCookieValue(req, name) {
  const cookieHeader = req.get?.("Cookie") || "";
  const prefix = `${name}=`;
  const part = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));
  if (!part) return null;
  return decodeURIComponent(part.slice(prefix.length));
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: Config.jwtRefreshCookieSecure,
    sameSite: Config.jwtRefreshCookieSameSite,
    path: "/v1/login",
  };
}

function setRefreshCookie(res, tokens) {
  if (!Config.jwtRefreshCookieEnabled || !tokens?.refreshToken) return;
  res.cookie(Config.jwtRefreshCookieName, tokens.refreshToken, {
    ...refreshCookieOptions(),
    expires: tokens.refreshTokenExpiresAt,
  });
}

function clearRefreshCookie(res) {
  if (!Config.jwtRefreshCookieEnabled) return;
  res.clearCookie(Config.jwtRefreshCookieName, refreshCookieOptions());
}

function getCurrentSessionId(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const decoded = JWT.verify(token, Config.jwtSecret);
    return decoded.session || null;
  } catch {
    return null;
  }
}

function serializeSession(session, currentSessionId = null) {
  return {
    id: session.id,
    userId: session.userId,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    replayDetectedAt: session.replayDetectedAt,
    current: currentSessionId === session.id,
  };
}

function jwtExpiresAt(expiresIn) {
  const now = Date.now();
  if (typeof expiresIn === "number") return new Date(now + expiresIn * 1000);
  const match = String(expiresIn || "").trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return new Date(now + 2 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return new Date(now + value * (multipliers[unit] || 1000));
}

function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata || null;
  const copy = { ...metadata };
  if (copy.linkToken) delete copy.linkToken;
  if (copy.idToken) delete copy.idToken;
  if (copy.subject) delete copy.subject;
  return copy;
}

async function writeAuthAudit(req, eventType, outcome, details = {}, options = {}) {
  return AuthAudit.log(
    {
      eventType,
      outcome,
      actorUserId: details.actorUserId,
      targetUserId: details.targetUserId,
      organizationId: details.organizationId,
      inviteId: details.inviteId,
      provider: normalizeProvider(details.provider),
      email: normalizeEmail(details.email),
      message: details.message || null,
      metadata: sanitizeAuditMetadata(details.metadata),
      userAgent: getRequestUserAgent(req),
    },
    { req, transaction: options.transaction }
  );
}

async function generateJWTAndSave(foundUser, req = null, existingSession = null) {
  if (!foundUser) return null;

  const sessionId = existingSession?.id || UUID("session");
  const refreshTokenId = UUID("wotlwedu");
  const refreshTokenHash = hashRefreshTokenId(refreshTokenId);
  const refreshTokenExpiresAt = jwtExpiresAt(Config.jwtRefreshExpiry);

  const authTokenContents = { user: foundUser.id, session: sessionId };
  const refreshTokenContents = {
    user: foundUser.id,
    session: sessionId,
    token: refreshTokenId,
    kind: "refresh",
  };

  // Record the last login time
  foundUser.lastLogin = Date.now();

  if (existingSession) {
    existingSession.previousRefreshTokenHash = existingSession.refreshTokenHash;
    existingSession.refreshTokenHash = refreshTokenHash;
    existingSession.expiresAt = refreshTokenExpiresAt;
    existingSession.lastUsedAt = new Date();
    existingSession.userAgent = getRequestUserAgent(req);
    existingSession.ipAddress = getRequestIp(req);
    await existingSession.save();
  } else {
    await Session.create({
      id: sessionId,
      userId: foundUser.id,
      refreshTokenHash,
      previousRefreshTokenHash: null,
      userAgent: getRequestUserAgent(req),
      ipAddress: getRequestIp(req),
      lastUsedAt: new Date(),
      expiresAt: refreshTokenExpiresAt,
    });
  }

  await foundUser.save();

  const newAuthToken = JWT.sign(authTokenContents, Config.jwtSecret, {
    expiresIn: Config.jwtExpiry,
  });
  const newRefreshToken = JWT.sign(refreshTokenContents, Config.jwtSecret, {
    expiresIn: Config.jwtRefreshExpiry,
  });

  return {
    authToken: newAuthToken,
    refreshToken: newRefreshToken,
    sessionId,
    refreshTokenExpiresAt,
  };
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
    sessionId: tokens.sessionId,
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

async function consumeInviteForExistingUser(req, inviteToken, user, action = "accept", transaction = null) {
  const resolved = await resolveInviteByToken(inviteToken, transaction);
  if (!resolved) {
    await writeAuthAudit(req, "organization_invite_lookup", "blocked", {
      targetUserId: user?.id,
      message: "Invite token not found or not active",
      metadata: { reason: "invite_not_found", action },
    });
    throw new Error("Invite not found");
  }

  const normalizedInviteEmail = normalizeEmail(resolved.invite.email);
  const normalizedUserEmail = normalizeEmail(user?.email);
  if (!normalizedUserEmail || normalizedInviteEmail !== normalizedUserEmail) {
    await writeAuthAudit(req, `organization_invite_${action}`, "blocked", {
      targetUserId: user?.id,
      organizationId: resolved.organization.id,
      inviteId: resolved.invite.id,
      email: resolved.invite.email,
      message: "Invite email did not match signed-in user",
      metadata: { reason: "invite_email_mismatch" },
    });
    throw new Error("Invite email does not match signed-in user");
  }

  if (user?.organizationId && user.organizationId !== resolved.organization.id) {
    await writeAuthAudit(req, `organization_invite_${action}`, "blocked", {
      targetUserId: user?.id,
      organizationId: resolved.organization.id,
      inviteId: resolved.invite.id,
      email: resolved.invite.email,
      message: "Invite target belongs to another organization",
      metadata: {
        reason: "belongs_to_another_organization",
        currentOrganizationId: user.organizationId,
      },
    });
    throw new Error("User already belongs to another organization");
  }

  if (action === "decline") {
    resolved.invite.declinedAt = new Date();
    resolved.invite.declinedByUserId = user.id;
    await resolved.invite.save({ transaction });
    await writeAuthAudit(req, "organization_invite_decline", "success", {
      targetUserId: user.id,
      organizationId: resolved.organization.id,
      inviteId: resolved.invite.id,
      email: resolved.invite.email,
      message: "Invite declined by signed-in user",
    }, { transaction });
    return {
      invite: resolved.invite,
      organization: resolved.organization,
      userChanged: false,
    };
  }

  if (!user.organizationId) {
    user.organizationId = resolved.organization.id;
    await user.save({ transaction });
  }
  resolved.invite.acceptedAt = new Date();
  resolved.invite.acceptedByUserId = user.id;
  await resolved.invite.save({ transaction });
  await writeAuthAudit(req, "organization_invite_accept", "success", {
    targetUserId: user.id,
    organizationId: resolved.organization.id,
    inviteId: resolved.invite.id,
    email: resolved.invite.email,
    message: "Invite accepted by signed-in user",
  }, { transaction });
  return {
    invite: resolved.invite,
    organization: resolved.organization,
    userChanged: !user.organizationId || user.organizationId === resolved.organization.id,
  };
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

async function findOrProvisionSocialUser(payload, auditContext = {}) {
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
      if (!user.active) {
        await writeAuthAudit(
          auditContext.req,
          "social_sign_in",
          "blocked",
          {
            targetUserId: existingIdentity.userId,
            provider,
            email,
            message: "Social identity linked to disabled account",
            metadata: { reason: "linked_account_disabled" },
          }
        );
        throw new Error("Account disabled");
      }
      if (existingIdentity.email !== email) {
        existingIdentity.email = email;
        await existingIdentity.save({ transaction });
      }
      await writeAuthAudit(
        auditContext.req,
        "social_sign_in",
        "success",
        {
          targetUserId: user.id,
          organizationId: user.organizationId,
          provider,
          email,
          message: "Signed in with linked social identity",
          metadata: { path: "existing_identity" },
        },
        { transaction }
      );
    } else {
      user = await User.findOne({
        where: { email },
        transaction,
      });

      if (user) {
        if (!user.active) {
          await writeAuthAudit(
            auditContext.req,
            "social_sign_in",
            "blocked",
            {
              targetUserId: user.id,
              organizationId: user.organizationId,
              provider,
              email,
              message: "Existing account is disabled",
              metadata: { reason: "matched_account_disabled" },
            }
          );
          throw new Error("Account disabled");
        }

        const existingProviderIdentity = await SocialIdentity.findOne({
          where: { userId: user.id, provider },
          transaction,
        });

        if (existingProviderIdentity) {
          await writeAuthAudit(
            auditContext.req,
            "social_sign_in",
            "blocked",
            {
              targetUserId: user.id,
              organizationId: user.organizationId,
              provider,
              email,
              message: "Account already linked to a different provider subject",
              metadata: { reason: "provider_already_linked" },
            }
          );
          throw new Error(`Account already linked to a different ${provider} sign-in`);
        }

        if (!user.auth) {
          await writeAuthAudit(
            auditContext.req,
            "social_sign_in",
            "blocked",
            {
              targetUserId: user.id,
              organizationId: user.organizationId,
              provider,
              email,
              message: "Existing account has no password-based login to confirm linking",
              metadata: { reason: "non_password_account_match" },
            }
          );
          throw new Error("Existing account requires manual support review");
        }

        linkRequired = true;
        linkToken = buildSocialLinkToken({
          provider,
          subject,
          email,
          userId: user.id,
          inviteToken,
        });
        await writeAuthAudit(
          auditContext.req,
          "social_link_confirmation",
          "pending",
          {
            targetUserId: user.id,
            organizationId: user.organizationId,
            provider,
            email,
            message: "Confirmed provider auth; waiting for explicit account link confirmation",
            metadata: { reason: "existing_password_account" },
          },
          { transaction }
        );
      } else {
        isNewUser = true;
        const userId = UUID("user");
        const invited = await resolveInviteByToken(inviteToken, transaction);

        let organizationId;
        let organizationAdmin = false;
        if (invited) {
          if (normalizeEmail(invited.invite.email) !== email) {
            await writeAuthAudit(
              auditContext.req,
              "social_sign_in",
              "blocked",
              {
                organizationId: invited.organization.id,
                inviteId: invited.invite.id,
                provider,
                email,
                message: "Invite email did not match verified provider email",
                metadata: { reason: "invite_email_mismatch" },
              }
            );
            throw new Error("Invite email does not match Google account");
          }
          organizationId = invited.organization.id;
          consumedInviteId = invited.invite.id;
          invited.invite.acceptedAt = new Date();
          invited.invite.acceptedByUserId = userId;
          await invited.invite.save({ transaction });
          await writeAuthAudit(
            auditContext.req,
            "organization_invite_accept",
            "success",
            {
              targetUserId: userId,
              organizationId,
              inviteId: invited.invite.id,
              provider,
              email,
              message: "Invite accepted during first social sign-in",
            },
            { transaction }
          );
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
        await writeAuthAudit(
          auditContext.req,
          "social_sign_in",
          "success",
          {
            targetUserId: user.id,
            organizationId: user.organizationId,
            inviteId: consumedInviteId,
            provider,
            email,
            message: invited
              ? "Provisioned new user from social sign-in and accepted invite"
              : "Provisioned new user and organization from social sign-in",
            metadata: {
              isNewUser: true,
              provisionedOrganizationId,
              consumedInviteId,
            },
          },
          { transaction }
        );
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

async function confirmSocialLink(linkToken, auditContext = {}) {
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
    if (!user.auth) {
      throw new Error("Existing account requires manual support review");
    }

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
      await writeAuthAudit(
        auditContext.req,
        "social_link_confirmation",
        "success",
        {
          targetUserId: user.id,
          organizationId: user.organizationId,
          provider,
          email,
          message: "Linked verified social identity to existing password account",
        },
        { transaction }
      );
    } else if (existingIdentity.email !== email) {
      existingIdentity.email = email;
      await existingIdentity.save({ transaction });
      await writeAuthAudit(
        auditContext.req,
        "social_link_confirmation",
        "success",
        {
          targetUserId: user.id,
          organizationId: user.organizationId,
          provider,
          email,
          message: "Refreshed linked social identity email",
          metadata: { refreshedIdentity: true },
        },
        { transaction }
      );
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
    if (!resolved) {
      await writeAuthAudit(req, "organization_invite_lookup", "blocked", {
        message: "Invite token not found or not active",
        metadata: { reason: "invite_not_found" },
      });
      return StatusResponse(res, 404, "Invite not found");
    }

    await writeAuthAudit(req, "organization_invite_lookup", "success", {
      organizationId: resolved.organization.id,
      inviteId: resolved.invite.id,
      email: resolved.invite.email,
      message: "Invite lookup succeeded",
    });

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

exports.postAcceptInvite = async (req, res, next) => {
  try {
    const inviteToken = req.params.token;
    if (!inviteToken) return StatusResponse(res, 421, "No invite token provided");
    if (!req.authUserId) return StatusResponse(res, 403, "Authentication required");

    const result = await database.transaction(async (transaction) => {
      const user = await User.findByPk(req.authUserId, { transaction });
      if (!user) throw new Error("User not found");
      return consumeInviteForExistingUser(req, inviteToken, user, "accept", transaction);
    });

    const refreshedUser = await User.findByPk(req.authUserId);
    const tokens = await generateJWTAndSave(refreshedUser, req);
    setRefreshCookie(res, tokens);
    return StatusResponse(
      res,
      200,
      "OK",
      buildAuthResponse(refreshedUser, tokens, {
        acceptedInviteId: result.invite.id,
        organizationName: result.organization.name,
      })
    );
  } catch (err) {
    if (
      err &&
      [
        "Invite not found",
        "Invite email does not match signed-in user",
        "User already belongs to another organization",
        "User not found",
      ].includes(err.message)
    ) {
      return StatusResponse(res, err.message === "Invite not found" ? 404 : 421, err.message);
    }
    next(err);
  }
};

exports.postDeclineInvite = async (req, res, next) => {
  try {
    const inviteToken = req.params.token;
    if (!inviteToken) return StatusResponse(res, 421, "No invite token provided");
    if (!req.authUserId) return StatusResponse(res, 403, "Authentication required");

    const result = await database.transaction(async (transaction) => {
      const user = await User.findByPk(req.authUserId, { transaction });
      if (!user) throw new Error("User not found");
      return consumeInviteForExistingUser(req, inviteToken, user, "decline", transaction);
    });

    return StatusResponse(res, 200, "OK", {
      inviteId: result.invite.id,
      organizationId: result.organization.id,
      organizationName: result.organization.name,
      status: "declined",
    });
  } catch (err) {
    if (
      err &&
      [
        "Invite not found",
        "Invite email does not match signed-in user",
        "User already belongs to another organization",
        "User not found",
      ].includes(err.message)
    ) {
      return StatusResponse(res, err.message === "Invite not found" ? 404 : 421, err.message);
    }
    next(err);
  }
};

exports.postLogin = async (req, res, next) => {
  try {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
      await writeAuthAudit(req, "password_sign_in", "blocked", {
        email,
        message: "Missing credentials",
        metadata: { reason: "missing_credentials" },
      });
      return StatusResponse(res, 403, "Invalid credentials");
    }

    const foundUser = await User.findOne({ where: { email: email } });
    if (!foundUser) {
      await writeAuthAudit(req, "password_sign_in", "blocked", {
        email,
        message: "Unknown account",
        metadata: { reason: "user_not_found" },
      });
      return StatusResponse(res, 403, "Invalid credentials");
    }

    if (!foundUser.active) {
      await writeAuthAudit(req, "password_sign_in", "blocked", {
        targetUserId: foundUser.id,
        organizationId: foundUser.organizationId,
        email,
        message: "Account disabled",
        metadata: { reason: "account_disabled" },
      });
      return StatusResponse(res, 403, "Account disabled");
    }

    if (!foundUser.auth || foundUser.auth === "") {
      await writeAuthAudit(req, "password_sign_in", "blocked", {
        targetUserId: foundUser.id,
        organizationId: foundUser.organizationId,
        email,
        message: "Password login unavailable",
        metadata: { reason: "missing_password_hash" },
      });
      return StatusResponse(res, 403, "Invalid credentials");
    }

    const passwordMatch = await bcrypt.compare(password, foundUser.auth);
    if (!passwordMatch) {
      await writeAuthAudit(req, "password_sign_in", "blocked", {
        targetUserId: foundUser.id,
        organizationId: foundUser.organizationId,
        email,
        message: "Invalid password",
        metadata: { reason: "password_mismatch" },
      });
      return StatusResponse(res, 403, "Invalid credentials");
    }

    if (foundUser.enable2fa) {
      foundUser.token2fa = UUID("wotlwedu");
      const userUpdated = await foundUser.save();
      if (!userUpdated) {
        return StatusResponse(res, 500, "Cannot update user with pending 2FA");
      }

      await writeAuthAudit(req, "password_sign_in", "pending", {
        targetUserId: foundUser.id,
        organizationId: foundUser.organizationId,
        email,
        message: "Password sign-in waiting for 2FA verification",
        metadata: { requires2fa: true },
      });

      return StatusResponse(res, 302, "2FA Enabled", {
        toURL: "/auth/verify/" + foundUser.id + "/" + foundUser.token2fa,
      });
    }

    const tokens = await generateJWTAndSave(foundUser, req);
    setRefreshCookie(res, tokens);
    await writeAuthAudit(req, "password_sign_in", "success", {
      targetUserId: foundUser.id,
      organizationId: foundUser.organizationId,
      email,
      message: "Password sign-in succeeded",
    });
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
      sessionId: tokens.sessionId,
    });
  } catch (err) {
    next(err);
  }
};

exports.postSocialLogin = async (req, res, next) => {
  try {
    const result = await findOrProvisionSocialUser(req.body || {}, { req });
    if (result.linkRequired) {
      return StatusResponse(res, 200, "Confirmation required", {
        linkRequired: true,
        linkToken: result.linkToken,
        provider: normalizeProvider(req.body?.provider),
      });
    }
    const tokens = await generateJWTAndSave(result.user, req);
    setRefreshCookie(res, tokens);
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
    if (err && err.message === "Must provide provider, subject, email, firstName, and lastName") {
      await writeAuthAudit(req, "social_sign_in", "blocked", {
        provider: req.body?.provider,
        email: req.body?.email,
        message: err.message,
      });
      return StatusResponse(res, 421, err.message);
    }
    if (
      err &&
      [
        "Invite email does not match Google account",
        "No default role is available",
        "Account already linked to a different google sign-in",
        "Existing account requires manual support review",
      ].includes(err.message)
    ) {
      if (err.message === "Existing account requires manual support review") {
        const matchedUser = await User.findOne({
          where: { email: normalizeEmail(req.body?.email) },
        });
        await writeAuthAudit(req, "social_sign_in", "blocked", {
          provider: req.body?.provider,
          email: req.body?.email,
          targetUserId: matchedUser?.id,
          organizationId: matchedUser?.organizationId,
          message: err.message,
        });
      }
      return StatusResponse(res, 421, err.message);
    }
    if (err && err.message === "Account disabled") {
      return StatusResponse(res, 403, "Account disabled");
    }
    next(err);
  }
};

exports.postGoogleLogin = async (req, res, next) => {
  let googleProfile = null;
  try {
    googleProfile = await verifyGoogleIdToken(req.body?.idToken);
    if (req.body?.inviteToken) {
      googleProfile.inviteToken = req.body.inviteToken;
    }
    const result = await findOrProvisionSocialUser(googleProfile, { req });
    if (result.linkRequired) {
      return StatusResponse(res, 200, "Confirmation required", {
        linkRequired: true,
        linkToken: result.linkToken,
        provider: "google",
      });
    }
    const tokens = await generateJWTAndSave(result.user, req);
    setRefreshCookie(res, tokens);
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
      ].includes(err.message)
    ) {
      await writeAuthAudit(req, "social_sign_in", "blocked", {
        provider: "google",
        email: googleProfile?.email || null,
        message: err.message,
      });
      return StatusResponse(res, 421, err.message);
    }
    if (
      err &&
      [
        "Invite email does not match Google account",
        "No default role is available",
        "Account already linked to a different google sign-in",
        "Existing account requires manual support review",
      ].includes(err.message)
    ) {
      if (err.message === "Existing account requires manual support review") {
        const matchedUser = await User.findOne({
          where: { email: normalizeEmail(googleProfile?.email || req.body?.email) },
        });
        await writeAuthAudit(req, "social_sign_in", "blocked", {
          provider: "google",
          email: googleProfile?.email || null,
          targetUserId: matchedUser?.id,
          organizationId: matchedUser?.organizationId,
          message: err.message,
        });
      }
      return StatusResponse(res, 421, err.message);
    }
    if (err && err.message === "Account disabled") {
      return StatusResponse(res, 403, "Account disabled");
    }
    next(err);
  }
};

exports.postConfirmSocialLink = async (req, res, next) => {
  try {
    const linkToken = (req.body?.linkToken || "").toString().trim();
    if (!linkToken) return StatusResponse(res, 421, "No social link token provided");

    const result = await confirmSocialLink(linkToken, { req });
    const tokens = await generateJWTAndSave(result.user, req);
    setRefreshCookie(res, tokens);
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
        "Existing account requires manual support review",
      ].includes(err.message)
    ) {
      await writeAuthAudit(req, "social_link_confirmation", "blocked", {
        message: err.message,
      });
      return StatusResponse(res, 421, err.message);
    }
    if (err && err.message === "Account disabled") {
      await writeAuthAudit(req, "social_link_confirmation", "blocked", {
        message: "Account disabled",
      });
      return StatusResponse(res, 403, "Account disabled");
    }
    next(err);
  }
};

exports._buildProvisionedOrganizationName = buildProvisionedOrganizationName;
exports._splitDisplayName = splitDisplayName;

exports.postRefreshLogin = async (req, res, next) => {
  try {
    const refreshToken =
      req.body.refreshToken ||
      getCookieValue(req, Config.jwtRefreshCookieName);
    if (!refreshToken)
      return StatusResponse(res, 403, "No refresh token provided");

    let decoded;
    try {
      decoded = JWT.verify(refreshToken, Config.jwtSecret);
    } catch (err) {
      return StatusResponse(res, 403, "Invalid refresh token", {
        message: err.name,
      });
    }

    if (!decoded.session || !decoded.token || decoded.kind !== "refresh") {
      return StatusResponse(res, 403, "Invalid refresh token");
    }

    const foundSession = await Session.findByPk(decoded.session);
    if (!foundSession || foundSession.userId !== decoded.user) {
      return StatusResponse(res, 403, "Invalid refresh token");
    }
    if (foundSession.revokedAt || foundSession.expiresAt.getTime() < Date.now()) {
      return StatusResponse(res, 403, "Session expired");
    }

    const presentedHash = hashRefreshTokenId(decoded.token);
    if (presentedHash !== foundSession.refreshTokenHash) {
      if (presentedHash === foundSession.previousRefreshTokenHash) {
        foundSession.replayDetectedAt = new Date();
        foundSession.revokedAt = new Date();
        await foundSession.save();
        await Session.update(
          { revokedAt: new Date() },
          { where: { userId: foundSession.userId, revokedAt: null } }
        );
        return StatusResponse(res, 403, "Refresh token replay detected");
      }
      return StatusResponse(res, 403, "Invalid refresh token");
    }

    const foundUser = await User.findByPk(decoded.user);
    if (!foundUser) return StatusResponse(res, 421, "Invalid credentials");
    if (!foundUser.active) return StatusResponse(res, 403, "Account disabled");

    const tokens = await generateJWTAndSave(foundUser, req, foundSession);
    setRefreshCookie(res, tokens);
    return StatusResponse(res, 200, "OK", buildAuthResponse(foundUser, tokens));
  } catch (err) {
    return next(err);
  }
};

exports.getSessions = async (req, res, next) => {
  try {
    const currentSessionId = getCurrentSessionId(req);
    const sessions = await Session.findAll({
      where: { userId: req.authUserId },
      order: [["lastUsedAt", "DESC"]],
    });
    return StatusResponse(res, 200, "OK", {
      sessions: sessions.map((session) => serializeSession(session, currentSessionId)),
    });
  } catch (err) {
    return next(err);
  }
};

exports.postLogout = async (req, res, next) => {
  try {
    const currentSessionId = getCurrentSessionId(req);
    if (currentSessionId) {
      await Session.update(
        { revokedAt: new Date() },
        { where: { id: currentSessionId, userId: req.authUserId, revokedAt: null } }
      );
    }
    clearRefreshCookie(res);
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    return next(err);
  }
};

exports.postLogoutAll = async (req, res, next) => {
  try {
    await Session.update(
      { revokedAt: new Date() },
      { where: { userId: req.authUserId, revokedAt: null } }
    );
    clearRefreshCookie(res);
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    return next(err);
  }
};

exports.deleteSession = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) return StatusResponse(res, 421, "No session ID provided");
    const foundSession = await Session.findOne({
      where: { id: sessionId, userId: req.authUserId },
    });
    if (!foundSession) return StatusResponse(res, 404, "Session not found");
    foundSession.revokedAt = new Date();
    await foundSession.save();
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    return next(err);
  }
};

exports.getUserSessions = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) return StatusResponse(res, 421, "No user ID provided");
    const sessions = await Session.findAll({
      where: { userId },
      order: [["lastUsedAt", "DESC"]],
    });
    return StatusResponse(res, 200, "OK", {
      sessions: sessions.map((session) => serializeSession(session)),
    });
  } catch (err) {
    return next(err);
  }
};

exports.deleteUserSession = async (req, res, next) => {
  try {
    const { userId, sessionId } = req.params;
    if (!userId || !sessionId) {
      return StatusResponse(res, 421, "No user/session ID provided");
    }
    const foundSession = await Session.findOne({ where: { id: sessionId, userId } });
    if (!foundSession) return StatusResponse(res, 404, "Session not found");
    foundSession.revokedAt = new Date();
    await foundSession.save();
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    return next(err);
  }
};

exports.postRevokeUserSessions = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) return StatusResponse(res, 421, "No user ID provided");
    await Session.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null } }
    );
    return StatusResponse(res, 200, "OK");
  } catch (err) {
    return next(err);
  }
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

    const tokens = await generateJWTAndSave(foundUser, req);
    setRefreshCookie(res, tokens);

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
        sessionId: tokens.sessionId,
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

    await AuthAudit.log(
      {
        eventType: "support_view_as_token_generated",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: targetUser.id,
        organizationId: targetUser.organizationId || null,
        email: targetUser.email,
        message: "Support generated temporary view-as token",
        metadata: {
          tokenId,
          expiresAt: expiresAt.toISOString(),
          reason: req.body.reason || null,
        },
      },
      { req }
    );

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

    await AuthAudit.log(
      {
        eventType: "support_view_as_token_revoked",
        outcome: "success",
        actorUserId: req.authUserId,
        targetUserId: foundToken.userId,
        message: "Support revoked temporary view-as token",
        metadata: { tokenId: foundToken.id },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      tokenId: foundToken.id,
      revokedAt: foundToken.revokedAt,
    });
  } catch (err) {
    return next(err);
  }
};

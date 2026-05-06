const { Op, Sequelize } = require("sequelize");

const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const StatusResponse = require("../util/statusresponse");
const UUID = require("../util/mini-uuid");
const Mailer = require("../util/mailer");
const AbuseAudit = require("../util/abuse-audit");
const {
  normalizeString,
  normalizeEmail,
  hashValue,
  randomToken,
  getIpAddress,
  getUserAgent,
} = require("../util/public-poll");

const Election = require("../model/election");
const List = require("../model/list");
const ListItem = require("../model/listitem");
const Item = require("../model/item");
const Image = require("../model/image");
const Status = require("../model/status");
const Workgroup = require("../model/workgroup");
const User = require("../model/user");
const PublicPollParticipant = require("../model/publicpollparticipant");
const PublicPollVote = require("../model/publicpollvote");
const PublicPollInvite = require("../model/publicpollinvite");
const ContactSuppression = require("../model/contactsuppression");
const TrustProfile = require("../model/trustprofile");
const AbuseAuditModel = require("../model/abuseaudit");
const Attributes = require("../model/attributes");

function serializeInvite(invite) {
  return {
    id: invite.id,
    electionId: invite.electionId,
    creatorUserId: invite.creatorUserId,
    recipientEmail: invite.recipientEmail,
    inviteToken: invite.inviteToken,
    status: invite.status,
    acceptedAt: invite.acceptedAt,
    acceptedByParticipantId: invite.acceptedByParticipantId,
    revokedAt: invite.revokedAt,
    lastSentAt: invite.lastSentAt,
    sendCount: invite.sendCount,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  };
}

function serializeTrustProfile(profile) {
  return {
    userId: profile.userId,
    trustTier: profile.trustTier,
    emailVerified: profile.emailVerified,
    canSendExternalInvites: profile.canSendExternalInvites,
    inviteQuotaDaily: profile.inviteQuotaDaily,
    inviteQuotaHourly: profile.inviteQuotaHourly,
    maxRecipientsPerPoll: profile.maxRecipientsPerPoll,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function getWorkgroupOrganizationId(workgroupId) {
  if (!workgroupId) return null;
  const wg = await Workgroup.findByPk(workgroupId, { raw: true });
  return wg ? wg.organizationId || null : null;
}

async function canManageElection(req, election, op = "edit") {
  if (!req || !election) return false;
  if (election.workgroupId) {
    return Security.canAccessWorkgroup(req, election.workgroupId);
  }
  return Security.getVerdict(req.verdicts, op).isAdmin || election.creator === req.authUserId;
}

async function getElectionForManage(req, electionId, op = "edit") {
  if (!electionId) return { status: 421, message: "No election ID provided" };
  const election = await Election.findByPk(electionId);
  if (!election) return { status: 404, message: "Election not found" };
  const allowed = await canManageElection(req, election, op);
  if (!allowed) return { status: 403, message: "Not authorized for this election" };
  return { election };
}

async function getPublicElectionByToken(token) {
  if (!token) return null;
  const election = await Election.findOne({
    where: {
      publicToken: token,
      publicDisabledAt: null,
      publicAccessMode: { [Op.in]: ["link_view", "link_vote"] },
      abuseStatus: { [Op.notIn]: ["locked"] },
    },
  });
  if (!election) return null;

  if (election.statusId) {
    election.setDataValue(
      "status",
      await Status.findByPk(election.statusId, { attributes: Attributes.Status })
    );
  }

  if (election.listId) {
    const list = await List.findByPk(election.listId, { attributes: Attributes.List });
    if (list) {
      const listItems = await ListItem.findAll({
        where: { listId: election.listId },
        attributes: ["itemId"],
        raw: true,
      });
      const itemIds = (listItems || []).map((row) => row.itemId).filter(Boolean);
      const items = [];
      for (const itemId of itemIds) {
        const foundItem = await Item.findByPk(itemId, { attributes: Attributes.Item });
        if (!foundItem) continue;
        let image = null;
        if (foundItem.imageId) {
          image = await Image.findByPk(foundItem.imageId, { attributes: Attributes.Image });
          if (image && typeof image.setDataValue === "function") {
            image.setDataValue("url", Config.imageURL + image.filename);
          }
        }
        const itemPayload =
          typeof foundItem.get === "function" ? foundItem.get({ plain: true }) : foundItem;
        itemPayload.image = image && typeof image.get === "function" ? image.get({ plain: true }) : image;
        items.push(itemPayload);
      }

      const listPayload = typeof list.get === "function" ? list.get({ plain: true }) : list;
      listPayload.items = items;
      election.setDataValue("list", listPayload);
    }
  }

  return election;
}

function getPublicShareUrl(token) {
  return `${Config.baseFrontendUrl}/public/poll/${encodeURIComponent(token)}`;
}

function serializePublicElection(election) {
  const list = typeof election?.get === "function" ? election.get("list") : election?.list;
  const status = typeof election?.get === "function" ? election.get("status") : election?.status;
  return {
    id: election.id,
    name: election.name,
    description: election.description,
    electionType: election.electionType,
    expiration: election.expiration,
    publicAccessMode: election.publicAccessMode,
    guestVotingEnabled: election.guestVotingEnabled,
    abuseStatus: election.abuseStatus,
    publicShareUrl: election.publicToken ? getPublicShareUrl(election.publicToken) : null,
    status: status || null,
    list: list
      ? {
          id: list.id,
          name: list.name,
          description: list.description,
          items: (list.items || []).map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            url: item.url,
            location: item.location,
            image: item.image || null,
          })),
        }
      : null,
  };
}

function getDefaultTrustValues(user) {
  const minAgeMs = Math.max(1, Number(Config.publicPollTrustMinAccountAgeHours) || 72) * 60 * 60 * 1000;
  const createdAtMs = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
  const ageMs = createdAtMs > 0 ? Date.now() - createdAtMs : 0;
  const isBasic = !!user?.verified && ageMs >= minAgeMs;

  if (isBasic) {
    return {
      trustTier: "basic",
      emailVerified: true,
      canSendExternalInvites: true,
      inviteQuotaDaily: Config.publicPollBasicInviteQuotaDaily,
      inviteQuotaHourly: Config.publicPollBasicInviteQuotaHourly,
      maxRecipientsPerPoll: Config.publicPollBasicRecipientsPerPoll,
    };
  }

  return {
    trustTier: "new",
    emailVerified: !!user?.verified,
    canSendExternalInvites: false,
    inviteQuotaDaily: 0,
    inviteQuotaHourly: 0,
    maxRecipientsPerPoll: 0,
  };
}

async function ensureTrustProfile(user) {
  let profile = await TrustProfile.findByPk(user.id);
  const defaults = getDefaultTrustValues(user);

  if (!profile) {
    profile = await TrustProfile.create({
      userId: user.id,
      ...defaults,
      creator: user.id,
    });
    return profile;
  }

  profile.emailVerified = !!user.verified;
  if (profile.trustTier !== "restricted") {
    if (defaults.canSendExternalInvites && profile.canSendExternalInvites === false) {
      profile.canSendExternalInvites = true;
      profile.inviteQuotaDaily = Math.max(profile.inviteQuotaDaily || 0, defaults.inviteQuotaDaily);
      profile.inviteQuotaHourly = Math.max(profile.inviteQuotaHourly || 0, defaults.inviteQuotaHourly);
      profile.maxRecipientsPerPoll = Math.max(
        profile.maxRecipientsPerPoll || 0,
        defaults.maxRecipientsPerPoll
      );
      if (profile.trustTier === "new") profile.trustTier = "basic";
    }
  }
  await profile.save();
  return profile;
}

async function getInviteUsage(userId, electionId) {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [hourlyCount, dailyCount, pollCount] = await Promise.all([
    PublicPollInvite.count({
      where: {
        creatorUserId: userId,
        createdAt: { [Op.gte]: oneHourAgo },
      },
    }),
    PublicPollInvite.count({
      where: {
        creatorUserId: userId,
        createdAt: { [Op.gte]: oneDayAgo },
      },
    }),
    PublicPollInvite.count({
      where: {
        creatorUserId: userId,
        electionId,
      },
    }),
  ]);

  return { hourlyCount, dailyCount, pollCount };
}

async function isSuppressed(email) {
  const recipientEmail = normalizeEmail(email);
  if (!recipientEmail) return false;
  const found = await ContactSuppression.findOne({
    where: {
      channel: "email",
      recipientHash: hashValue(recipientEmail),
    },
  });
  return !!found;
}

async function markInviteAccepted(inviteToken, participantId) {
  if (!inviteToken) return null;
  const invite = await PublicPollInvite.findOne({
    where: {
      inviteToken,
      status: { [Op.in]: ["pending", "sent"] },
      revokedAt: null,
    },
  });
  if (!invite) return null;
  invite.status = "accepted";
  invite.acceptedAt = new Date();
  invite.acceptedByParticipantId = participantId;
  await invite.save();
  return invite;
}

async function assertElectionItem(electionId, itemId) {
  if (!electionId || !itemId) return null;
  const election = await Election.findByPk(electionId, { raw: true });
  if (!election?.listId) return null;
  const relation = await ListItem.findOne({
    where: {
      listId: election.listId,
      itemId,
    },
    raw: true,
  });
  if (!relation) return null;
  return Item.findByPk(itemId, { attributes: ["id"] });
}

module.exports.getPublicElection = async (req, res, next) => {
  try {
    const token = normalizeString(req.params.token);
    if (!token) return StatusResponse(res, 421, "No public token provided");

    const election = await getPublicElectionByToken(token);
    if (!election) return StatusResponse(res, 404, "Public election not found");

    await AbuseAudit.log(
      {
        electionId: election.id,
        eventType: "public_poll_view",
        outcome: "success",
        message: "Public poll viewed",
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      election: serializePublicElection(election),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postPublicElectionSession = async (req, res, next) => {
  try {
    const token = normalizeString(req.params.token);
    if (!token) return StatusResponse(res, 421, "No public token provided");

    const election = await getPublicElectionByToken(token);
    if (!election) return StatusResponse(res, 404, "Public election not found");
    if (election.publicAccessMode === "private" || election.guestVotingEnabled !== true) {
      return StatusResponse(res, 403, "Guest voting is not enabled for this poll");
    }

    const sessionToken = randomToken(24);
    const inviteToken = normalizeString(req.body?.inviteToken);
    const participant = await PublicPollParticipant.create({
      id: UUID("ppart"),
      electionId: election.id,
      sessionKeyHash: hashValue(sessionToken),
      emailHash: null,
      displayName: normalizeString(req.body?.displayName),
      consentState: inviteToken ? "invited" : "anonymous",
      lastSeenAt: new Date(),
      creator: "public",
    });

    const acceptedInvite = await markInviteAccepted(inviteToken, participant.id);
    if (acceptedInvite?.recipientEmailHash) {
      participant.emailHash = acceptedInvite.recipientEmailHash;
      participant.consentState = "invited";
      await participant.save();
    }

    await AbuseAudit.log(
      {
        electionId: election.id,
        eventType: "public_poll_guest_session_create",
        outcome: "success",
        message: "Public poll guest session created",
        metadata: { participantId: participant.id, consentState: participant.consentState },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      sessionToken,
      participantId: participant.id,
      consentState: participant.consentState,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postPublicElectionVote = async (req, res, next) => {
  try {
    const token = normalizeString(req.params.token);
    const sessionToken = normalizeString(req.body?.sessionToken);
    const itemId = normalizeString(req.body?.itemId);
    const decision = normalizeString(req.body?.decision) || "vote";

    if (!token) return StatusResponse(res, 421, "No public token provided");
    if (!sessionToken) return StatusResponse(res, 421, "No session token provided");
    if (!itemId) return StatusResponse(res, 421, "No item ID provided");

    const election = await getPublicElectionByToken(token);
    if (!election) return StatusResponse(res, 404, "Public election not found");
    if (election.publicAccessMode !== "link_vote" || election.guestVotingEnabled !== true) {
      return StatusResponse(res, 403, "Public voting is not enabled for this poll");
    }

    const participant = await PublicPollParticipant.findOne({
      where: {
        electionId: election.id,
        sessionKeyHash: hashValue(sessionToken),
      },
    });
    if (!participant) return StatusResponse(res, 403, "Invalid public session");

    const allowedItem = await assertElectionItem(election.id, itemId);
    if (!allowedItem) return StatusResponse(res, 421, "Item is not part of this poll");

    let existingVote = await PublicPollVote.findOne({
      where: {
        participantId: participant.id,
        itemId,
      },
    });

    if (!existingVote) {
      existingVote = new PublicPollVote({
        id: UUID("ppvote"),
        electionId: election.id,
        itemId,
        participantId: participant.id,
        creator: "public",
      });
    }

    existingVote.decision = decision;
    existingVote.sourceIpHash = hashValue(getIpAddress(req));
    existingVote.userAgentHash = hashValue(getUserAgent(req));
    await existingVote.save();

    participant.lastSeenAt = new Date();
    await participant.save();

    await AbuseAudit.log(
      {
        electionId: election.id,
        eventType: "public_poll_vote_cast",
        outcome: "success",
        message: "Public poll vote cast",
        metadata: { participantId: participant.id, itemId, decision },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      vote: {
        id: existingVote.id,
        electionId: existingVote.electionId,
        itemId: existingVote.itemId,
        participantId: existingVote.participantId,
        decision: existingVote.decision,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postPublicElectionReport = async (req, res, next) => {
  try {
    const token = normalizeString(req.params.token);
    const reason = normalizeString(req.body?.reason) || "reported";

    if (!token) return StatusResponse(res, 421, "No public token provided");
    const election = await getPublicElectionByToken(token);
    if (!election) return StatusResponse(res, 404, "Public election not found");

    await AbuseAudit.log(
      {
        electionId: election.id,
        eventType: "public_poll_reported",
        outcome: "flagged",
        message: "Public poll reported",
        metadata: { reason },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK");
  } catch (err) {
    next(err);
  }
};

module.exports.postEnablePublicElection = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "edit");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const election = managed.election;
    const requestedMode = normalizeString(req.body?.publicAccessMode) || "link_vote";
    if (!["link_view", "link_vote"].includes(requestedMode)) {
      return StatusResponse(res, 421, "Invalid publicAccessMode");
    }

    election.publicAccessMode = requestedMode;
    election.publicToken = election.publicToken || randomToken(18);
    election.publicEnabledAt = new Date();
    election.publicDisabledAt = null;
    election.guestVotingEnabled =
      req.body?.guestVotingEnabled === undefined ? requestedMode === "link_vote" : !!req.body.guestVotingEnabled;
    election.allowPlatformInvites = !!req.body?.allowPlatformInvites;
    election.invitePolicy = election.allowPlatformInvites ? "trusted_only" : "none";
    election.abuseStatus = "normal";
    await election.save();

    await AbuseAudit.log(
      {
        actorUserId: req.authUserId,
        electionId: election.id,
        eventType: "public_poll_enabled",
        outcome: "success",
        message: "Public poll enabled",
        metadata: {
          publicAccessMode: election.publicAccessMode,
          guestVotingEnabled: election.guestVotingEnabled,
          allowPlatformInvites: election.allowPlatformInvites,
        },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      publicElection: {
        electionId: election.id,
        publicAccessMode: election.publicAccessMode,
        publicToken: election.publicToken,
        publicShareUrl: getPublicShareUrl(election.publicToken),
        guestVotingEnabled: election.guestVotingEnabled,
        allowPlatformInvites: election.allowPlatformInvites,
        invitePolicy: election.invitePolicy,
        abuseStatus: election.abuseStatus,
        publicEnabledAt: election.publicEnabledAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postDisablePublicElection = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "edit");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const election = managed.election;
    election.publicAccessMode = "private";
    election.guestVotingEnabled = false;
    election.allowPlatformInvites = false;
    election.invitePolicy = "none";
    election.publicDisabledAt = new Date();
    await election.save();

    await AbuseAudit.log(
      {
        actorUserId: req.authUserId,
        electionId: election.id,
        eventType: "public_poll_disabled",
        outcome: "success",
        message: "Public poll disabled",
      },
      { req }
    );

    return StatusResponse(res, 200, "OK");
  } catch (err) {
    next(err);
  }
};

module.exports.getPublicElectionStats = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "view");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const election = managed.election;
    const [participantCount, voteCount, inviteCount, acceptedInviteCount, reportCount] =
      await Promise.all([
        PublicPollParticipant.count({ where: { electionId: election.id } }),
        PublicPollVote.count({ where: { electionId: election.id } }),
        PublicPollInvite.count({ where: { electionId: election.id } }),
        PublicPollInvite.count({
          where: {
            electionId: election.id,
            status: "accepted",
          },
        }),
        AbuseAuditModel.count({
          where: {
            electionId: election.id,
            eventType: "public_poll_reported",
          },
        }),
      ]);

    return StatusResponse(res, 200, "OK", {
      publicElection: {
        electionId: election.id,
        publicAccessMode: election.publicAccessMode,
        publicToken: election.publicToken,
        publicShareUrl: election.publicToken ? getPublicShareUrl(election.publicToken) : null,
        guestVotingEnabled: election.guestVotingEnabled,
        allowPlatformInvites: election.allowPlatformInvites,
        abuseStatus: election.abuseStatus,
      },
      statistics: {
        participantCount,
        voteCount,
        inviteCount,
        acceptedInviteCount,
        reportCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getPublicPollTrustProfile = async (req, res, next) => {
  try {
    const foundUser = await User.findByPk(req.authUserId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    const profile = await ensureTrustProfile(foundUser);
    return StatusResponse(res, 200, "OK", {
      trustProfile: serializeTrustProfile(profile),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.getPublicElectionInvites = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "view");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const invites = await PublicPollInvite.findAll({
      where: { electionId: managed.election.id },
      order: [["createdAt", "DESC"]],
    });

    return StatusResponse(res, 200, "OK", {
      invites: (invites || []).map(serializeInvite),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postPublicElectionInvite = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "edit");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const election = managed.election;
    if (!election.publicToken || election.publicAccessMode === "private") {
      return StatusResponse(res, 421, "Public poll must be enabled before invites can be sent");
    }
    if (election.allowPlatformInvites !== true || election.invitePolicy !== "trusted_only") {
      return StatusResponse(res, 403, "Platform invites are not enabled for this poll");
    }

    const foundUser = await User.findByPk(req.authUserId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    const profile = await ensureTrustProfile(foundUser);
    if (profile.canSendExternalInvites !== true || profile.trustTier === "restricted") {
      await AbuseAudit.log(
        {
          actorUserId: req.authUserId,
          electionId: election.id,
          eventType: "public_poll_invite_blocked_trust",
          outcome: "blocked",
          message: "External invite blocked by trust policy",
          metadata: { trustTier: profile.trustTier },
        },
        { req }
      );
      return StatusResponse(res, 403, "This account is not allowed to send external invites");
    }

    const emailsRaw = Array.isArray(req.body?.emails)
      ? req.body.emails
      : req.body?.email
      ? [req.body.email]
      : [];
    const emails = [...new Set(emailsRaw.map(normalizeEmail).filter(Boolean))];
    if (emails.length === 0) return StatusResponse(res, 421, "No recipient email provided");

    const usage = await getInviteUsage(req.authUserId, election.id);
    if (usage.hourlyCount + emails.length > profile.inviteQuotaHourly) {
      return StatusResponse(res, 429, "Hourly public invite quota exceeded");
    }
    if (usage.dailyCount + emails.length > profile.inviteQuotaDaily) {
      return StatusResponse(res, 429, "Daily public invite quota exceeded");
    }
    if (usage.pollCount + emails.length > profile.maxRecipientsPerPoll) {
      return StatusResponse(res, 429, "Per-poll recipient quota exceeded");
    }

    const results = [];
    for (const email of emails) {
      if (await isSuppressed(email)) {
        await AbuseAudit.log(
          {
            actorUserId: req.authUserId,
            electionId: election.id,
            eventType: "public_poll_invite_blocked_suppression",
            outcome: "blocked",
            message: "Recipient is suppressed",
            metadata: { email },
          },
          { req }
        );
        results.push({ email, status: 409, message: "Recipient has opted out" });
        continue;
      }

      let invite = await PublicPollInvite.findOne({
        where: {
          electionId: election.id,
          recipientEmailHash: hashValue(email),
        },
      });

      if (invite && invite.status === "accepted") {
        results.push({ email, status: 409, message: "Recipient already accepted this invite" });
        continue;
      }

      if (!invite) {
        invite = await PublicPollInvite.create({
          id: UUID("ppinvite"),
          electionId: election.id,
          creatorUserId: req.authUserId,
          recipientEmail: email,
          recipientEmailHash: hashValue(email),
          inviteToken: randomToken(18),
          status: "pending",
          lastSentAt: new Date(),
          sendCount: 1,
          creator: req.authUserId,
        });
      } else {
        invite.inviteToken = invite.inviteToken || randomToken(18);
        invite.status = "pending";
        invite.revokedAt = null;
        invite.lastSentAt = new Date();
        invite.sendCount = Number(invite.sendCount || 0) + 1;
        await invite.save();
      }

      await Mailer.sendPublicPollInviteMessage(
        email,
        election.name,
        election.publicToken,
        invite.inviteToken
      );

      await AbuseAudit.log(
        {
          actorUserId: req.authUserId,
          electionId: election.id,
          eventType: "public_poll_invite_create",
          outcome: "success",
          message: "Public poll invite sent",
          metadata: { email, inviteId: invite.id },
        },
        { req }
      );

      results.push({ email, status: 200, message: "OK", invite: serializeInvite(invite) });
    }

    return StatusResponse(res, 200, "OK", { results });
  } catch (err) {
    next(err);
  }
};

module.exports.postResendPublicElectionInvite = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "edit");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const election = managed.election;
    const invite = await PublicPollInvite.findOne({
      where: {
        id: req.params.inviteId,
        electionId: election.id,
      },
    });
    if (!invite) return StatusResponse(res, 404, "Invite not found");
    if (invite.revokedAt) return StatusResponse(res, 409, "Invite has been revoked");
    if (invite.status === "accepted") return StatusResponse(res, 409, "Invite already accepted");
    if (await isSuppressed(invite.recipientEmail)) {
      return StatusResponse(res, 409, "Recipient has opted out");
    }

    const foundUser = await User.findByPk(req.authUserId);
    if (!foundUser) return StatusResponse(res, 404, "User not found");
    const profile = await ensureTrustProfile(foundUser);
    if (profile.canSendExternalInvites !== true || profile.trustTier === "restricted") {
      return StatusResponse(res, 403, "This account is not allowed to send external invites");
    }

    const cooldownMs =
      Math.max(1, Number(Config.publicPollInviteResendCooldownHours) || 72) *
      60 *
      60 *
      1000;
    if (
      invite.lastSentAt &&
      new Date(invite.lastSentAt).getTime() + cooldownMs > Date.now()
    ) {
      return StatusResponse(res, 429, "Invite resend cooldown is still active");
    }

    invite.lastSentAt = new Date();
    invite.sendCount = Number(invite.sendCount || 0) + 1;
    invite.status = "pending";
    await invite.save();

    await Mailer.sendPublicPollInviteMessage(
      invite.recipientEmail,
      election.name,
      election.publicToken,
      invite.inviteToken
    );

    await AbuseAudit.log(
      {
        actorUserId: req.authUserId,
        electionId: election.id,
        eventType: "public_poll_invite_resend",
        outcome: "success",
        message: "Public poll invite resent",
        metadata: { inviteId: invite.id, email: invite.recipientEmail },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK", {
      invite: serializeInvite(invite),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.deletePublicElectionInvite = async (req, res, next) => {
  try {
    const managed = await getElectionForManage(req, req.params.electionId, "edit");
    if (!managed.election) return StatusResponse(res, managed.status, managed.message);

    const invite = await PublicPollInvite.findOne({
      where: {
        id: req.params.inviteId,
        electionId: managed.election.id,
      },
    });
    if (!invite) return StatusResponse(res, 404, "Invite not found");

    invite.revokedAt = new Date();
    invite.status = "revoked";
    await invite.save();

    await AbuseAudit.log(
      {
        actorUserId: req.authUserId,
        electionId: managed.election.id,
        eventType: "public_poll_invite_revoke",
        outcome: "success",
        message: "Public poll invite revoked",
        metadata: { inviteId: invite.id, email: invite.recipientEmail },
      },
      { req }
    );

    return StatusResponse(res, 200, "OK");
  } catch (err) {
    next(err);
  }
};

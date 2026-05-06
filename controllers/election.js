const Util = require("util");
const { Op } = require("sequelize");
const Sequelize = require("sequelize");

const Config = require("../config/wotlwedu");
const Security = require("../util/security");
const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const toBool = require("../util/tobool");
const CategoryScope = require("../util/categoryscope");
const { normalizeOptionalId } = require("../util/idnormalize");
const { copyObject, getStatusIdByName, buildCategoryMenu } = require("../util/helpers");
const Notify = require("../util/notification");

const Election = require("../model/election");
const Group = require("../model/group");
const List = require("../model/list");
const Item = require("../model/item");
const User = require("../model/user");
const Category = require("../model/category");
const Vote = require("../model/vote");
const Image = require("../model/image");
const Status = require("../model/status");
const Workgroup = require("../model/workgroup");
const GroupMember = require("../model/groupmember");
const Notification = require("../model/notification");

const Attributes = require("../model/attributes");
const PARTICIPATION_REMINDER_STATUS = "Poll Participation Reminder";

function normalizeReminderStates(value) {
  const allowedStates = new Set(["not_started", "in_progress", "completed"]);
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = [...new Set(rawValues
    .map((entry) => (entry === undefined || entry === null ? null : entry.toString().trim().toLowerCase()))
    .filter((entry) => entry && allowedStates.has(entry)))];

  return normalized.length ? normalized : ["not_started", "in_progress"];
}

function normalizeReminderUserIds(value) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(rawValues
    .map((entry) => (entry === undefined || entry === null ? null : entry.toString().trim()))
    .filter(Boolean))];
}

function buildReminderText(election, senderName, customMessage) {
  const reminderPrefix = `Reminder from ${senderName || "wotlwedu"}: ${election.name}`;
  if (!customMessage) return `${reminderPrefix} still needs your response`;
  return `${reminderPrefix} - ${customMessage}`;
}

async function buildReminderSummaryByUserId(electionId, userIds) {
  const empty = new Map();
  if (!electionId || !userIds || !userIds.length) return empty;

  const reminderTypeId = await getStatusIdByName(PARTICIPATION_REMINDER_STATUS);
  if (!reminderTypeId || reminderTypeId < 0) return empty;

  const reminders = await Notification.findAll({
    where: {
      objectId: electionId,
      type: reminderTypeId,
      userId: { [Op.in]: userIds },
    },
    attributes: ["id", "userId", "senderId", "createdAt"],
    order: [["createdAt", "DESC"]],
    raw: true,
  });

  const summaryByUserId = new Map();
  for (const reminder of reminders || []) {
    if (!summaryByUserId.has(reminder.userId)) {
      summaryByUserId.set(reminder.userId, {
        reminderCount: 0,
        lastReminderAt: null,
        lastReminderSenderId: null,
      });
    }
    const current = summaryByUserId.get(reminder.userId);
    current.reminderCount += 1;
    if (!current.lastReminderAt) {
      current.lastReminderAt = reminder.createdAt || null;
      current.lastReminderSenderId = reminder.senderId || null;
    }
  }

  return summaryByUserId;
}

function generateIncludes(details, req) {
  const includes = [];

  includes.push({
    model: Status,
    attributes: Attributes.Status,
  });

  if (details) {
    const splitDetail = details.split(",");
    if (splitDetail.includes("group")) {
      includes.push({
        model: Group,
        attributes: Attributes.Group,
        include: [
          {
            model: User,
            attributes: Attributes.User,
            through: { attributes: [] },
          },
        ],
      });
    }
    if (splitDetail.includes("list")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn(
          "CONCAT",
          Config.imageURL,
          Sequelize.col("list.items.image.filename")
        ),
        "url",
      ]);
      includes.push({
        model: List,
        attributes: Attributes.List,
        include: [
          {
            model: Item,
            attributes: Attributes.Item,
            through: { attributes: [] },
            include: [{ model: Image, attributes: modImageAttributes }],
          },
        ],
      });
    }
    if (splitDetail.includes("category")) {
      includes.push({
        model: Category,
        attributes: Attributes.Category,
        where: { creator: req.authUserId },
        required: false,
      });
    }
    if (splitDetail.includes("image")) {
      const modImageAttributes = Attributes.Image.slice();
      modImageAttributes.push([
        Sequelize.fn("CONCAT", Config.imageURL, Sequelize.col("image.filename")),
        "url",
      ]);
      includes.push({
        model: Image,
        attributes: modImageAttributes,
      });
    }
  }

  return includes;
}

async function assertCanAccessElection(req, election, op) {
  if (!req || !election) return false;
  if (election.workgroupId) {
    return await Security.canAccessWorkgroup(req, election.workgroupId);
  }
  return (
    Security.getVerdict(req.verdicts, op).isAdmin ||
    election.creator === req.authUserId
  );
}

async function getWorkgroupOrganizationId(workgroupId) {
  if (!workgroupId) return null;
  const wg = await Workgroup.findByPk(workgroupId, { raw: true });
  return wg ? wg.organizationId || null : null;
}

function buildAudienceMemberState(totalVotes, pendingVotes) {
  if (!totalVotes || totalVotes <= 0) return "not_started";
  if (pendingVotes <= 0) return "completed";
  if (pendingVotes >= totalVotes) return "not_started";
  return "in_progress";
}

async function buildParticipationSummary(election) {
  if (!election) return null;

  const group = election.groupId
    ? await Group.findByPk(election.groupId, {
        attributes: Attributes.Group,
        raw: true,
      })
    : null;
  const list = election.listId
    ? await List.findByPk(election.listId, {
        attributes: Attributes.List,
        raw: true,
      })
    : null;

  let audienceUsers = [];
  if (group?.id) {
    const memberships = await GroupMember.findAll({
      where: { groupId: group.id },
      attributes: ["userId"],
      raw: true,
    });
    const userIds = [...new Set((memberships || []).map((entry) => entry.userId).filter(Boolean))];
    if (userIds.length) {
      audienceUsers = await User.findAll({
        where: { id: { [Op.in]: userIds } },
        attributes: [
          "id",
          "firstName",
          "lastName",
          "alias",
          "email",
          "organizationAdmin",
          "workgroupAdmin",
        ],
        order: [["firstName"], ["lastName"], ["email"]],
        raw: true,
      });
    }
  }

  const pendingStatusId = await getStatusIdByName("Pending");
  const voteRows = await Vote.findAll({
    where: { electionId: election.id },
    attributes: [
      "userId",
      [Sequelize.fn("COUNT", Sequelize.col("id")), "totalVotes"],
      [
        Sequelize.fn(
          "SUM",
          Sequelize.literal(`CASE WHEN statusId = ${Number(pendingStatusId || 0)} THEN 1 ELSE 0 END`)
        ),
        "pendingVotes",
      ],
    ],
    group: ["userId"],
    raw: true,
  });

  const voteSummaryByUserId = new Map(
    (voteRows || []).map((row) => [
      row.userId,
      {
        totalVotes: Number(row.totalVotes) || 0,
        pendingVotes: Number(row.pendingVotes) || 0,
      },
    ])
  );

  const participants = (audienceUsers || []).map((user) => {
    const voteSummary = voteSummaryByUserId.get(user.id) || {
      totalVotes: 0,
      pendingVotes: 0,
    };
    const state = buildAudienceMemberState(voteSummary.totalVotes, voteSummary.pendingVotes);
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName:
        [user.firstName || "", user.lastName || ""].filter(Boolean).join(" ").trim() ||
        user.alias ||
        user.email ||
        user.id,
      alias: user.alias,
      email: user.email,
      state,
      totalVotes: voteSummary.totalVotes,
      pendingVotes: voteSummary.pendingVotes,
      castVotes: Math.max(voteSummary.totalVotes - voteSummary.pendingVotes, 0),
      organizationAdmin: user.organizationAdmin === true,
      workgroupAdmin: user.workgroupAdmin === true,
    };
  });
  const reminderSummaryByUserId = await buildReminderSummaryByUserId(
    election.id,
    participants.map((participant) => participant.id).filter(Boolean)
  );
  const enrichedParticipants = participants.map((participant) => {
    const reminderSummary = reminderSummaryByUserId.get(participant.id) || {
      reminderCount: 0,
      lastReminderAt: null,
      lastReminderSenderId: null,
    };
    return {
      ...participant,
      reminderCount: reminderSummary.reminderCount,
      lastReminderAt: reminderSummary.lastReminderAt,
      lastReminderSenderId: reminderSummary.lastReminderSenderId,
    };
  });

  const expectedParticipants = enrichedParticipants.length;
  const notStartedCount = enrichedParticipants.filter((participant) => participant.state === "not_started").length;
  const inProgressCount = enrichedParticipants.filter((participant) => participant.state === "in_progress").length;
  const completedCount = enrichedParticipants.filter((participant) => participant.state === "completed").length;
  const totalVotes = enrichedParticipants.reduce((sum, participant) => sum + participant.totalVotes, 0);
  const pendingVotes = enrichedParticipants.reduce((sum, participant) => sum + participant.pendingVotes, 0);
  const castVotes = enrichedParticipants.reduce((sum, participant) => sum + participant.castVotes, 0);
  const reminderCount = enrichedParticipants.reduce(
    (sum, participant) => sum + (Number(participant.reminderCount) || 0),
    0
  );
  const remindedCount = enrichedParticipants.filter(
    (participant) => (Number(participant.reminderCount) || 0) > 0
  ).length;
  const lastReminderAt = enrichedParticipants
    .map((participant) => participant.lastReminderAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  return {
    audience: {
      group: group
        ? {
            id: group.id,
            name: group.name,
            description: group.description,
          }
        : null,
      list: list
        ? {
            id: list.id,
            name: list.name,
          }
        : null,
      expectedParticipants,
      participants: enrichedParticipants,
    },
    participation: {
      expectedParticipants,
      notStartedCount,
      inProgressCount,
      completedCount,
      followUpCount: notStartedCount + inProgressCount,
      totalVotes,
      castVotes,
      pendingVotes,
      reminderCount,
      remindedCount,
      lastReminderAt,
      completionRate:
        expectedParticipants > 0
          ? Math.round((completedCount / expectedParticipants) * 100)
          : 0,
    },
  };
}

module.exports.getSingleElection = (req, res, next) => {
  const electionToFind = req.params.electionId;
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  const whereCondition = {};
  whereCondition.id = electionToFind;

  const includes = generateIncludes(req.query.detail, req);

  const options = {};

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Election;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      const allowed = await assertCanAccessElection(req, foundElection, "view");
      if (!allowed)
        return StatusResponse(res, 403, "Not authorized for this election");

      return StatusResponse(res, 200, "OK", { election: foundElection });
    })
    .catch((err) => next(err));
};

module.exports.getAllElection = async (req, res, next) => {
  let userFilter = req.query.filter;
  let page = +req.query.page;
  let itemsPerPage = +req.query.items;
  if (!page) page = 1;
  if (page <= 0) page = 1;
  if (!itemsPerPage) itemsPerPage = +Config.defaultItemsPerPage;

  const options = {};

  options.limit = itemsPerPage;
  options.offset = (page - 1) * itemsPerPage;

  // Sort order
  options.order = [["name"]];

  let whereCondition = {};

  const requestedWorkgroupId = normalizeOptionalId(req.query.workgroupId).value;
  if (requestedWorkgroupId) {
    const allowed = await Security.canAccessWorkgroup(req, requestedWorkgroupId);
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    whereCondition.workgroupId = requestedWorkgroupId;
  }

  if (userFilter) {
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        { id: { [Op.like]: "%" + userFilter + "%" } },
        { name: { [Op.like]: "%" + userFilter + "%" } },
        { description: { [Op.like]: "%" + userFilter + "%" } },
      ],
    };
  }

  if (!requestedWorkgroupId && !Security.getVerdict(req.verdicts, "view").isAdmin) {
    whereCondition.creator = req.authUserId;
  }

  const detail = req.query.detail;
  const includes = generateIncludes(req.query.detail, req);

  options.where = whereCondition;
  options.include = includes;
  options.attributes = Attributes.Election;
  options.distinct = true;

  Election.findAndCountAll(options).then(({ count, rows }) => {
    if (!rows) {
      return StatusResponse(res, 200, "OK", {
        total: 0,
        page: 1,
        itemsPerPage: itemsPerPage,
        elections: [],
      });
    }

    const payload = {
      total: count,
      page: page,
      itemsPerPage: itemsPerPage,
      elections: rows,
    };
    if (toBool(req.query.collapsible)) {
      payload.menu = buildCategoryMenu(rows, "elections");
    }
    return StatusResponse(res, 200, "OK", payload);
  });
};

module.exports.postUpdateElection = (req, res, next) => {
  const options = {};
  const whereCondition = {};
  const electionToFind = req.params.electionId;
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  whereCondition.id = electionToFind;

  options.where = whereCondition;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      const allowedExisting = await assertCanAccessElection(
        req,
        foundElection,
        "edit"
      );
      if (!allowedExisting)
        return StatusResponse(res, 403, "Not authorized for this election");

      // Determine what the workgroup would be after this update.
      let effectiveWorkgroupId = foundElection.workgroupId || null;
      const normalizedWorkgroup = normalizeOptionalId(req.body.workgroupId);
      if (normalizedWorkgroup.value) {
        const allowedWg = await Security.canAccessWorkgroup(req, normalizedWorkgroup.value);
        if (!allowedWg)
          return StatusResponse(res, 403, "Not authorized for this workgroup");
        effectiveWorkgroupId = normalizedWorkgroup.value;
      } else if (normalizedWorkgroup.hasField && normalizedWorkgroup.value === null) {
        if (!Security.getVerdict(req.verdicts, "edit").isAdmin) {
          return StatusResponse(res, 403, "Only system admins can clear workgroupId");
        }
        effectiveWorkgroupId = null;
      }

      // If workgroup-scoped, validate referenced objects are in the same workgroup/org.
      if (effectiveWorkgroupId) {
        const effectiveOrgId = await getWorkgroupOrganizationId(effectiveWorkgroupId);
        if (!effectiveOrgId)
          return StatusResponse(res, 404, "Workgroup not found");

        if (req.body.listId) {
          const list = await List.findByPk(req.body.listId, { raw: true });
          if (!list) return StatusResponse(res, 404, "List not found");
          if (!list.workgroupId || list.workgroupId !== effectiveWorkgroupId) {
            return StatusResponse(res, 421, "List is not in the requested workgroup");
          }
        }
        if (req.body.listId === null) {
          // ok
        }

        if (req.body.imageId) {
          const image = await Image.findByPk(req.body.imageId, { raw: true });
          if (!image) return StatusResponse(res, 404, "Image not found");
          if (!image.workgroupId || image.workgroupId !== effectiveWorkgroupId) {
            return StatusResponse(res, 421, "Image is not in the requested workgroup");
          }
        }
        if (req.body.imageId === null) {
          // ok
        }

        if (req.body.groupId) {
          const group = await Group.findByPk(req.body.groupId, { raw: true });
          if (!group) return StatusResponse(res, 404, "Group not found");
          if (group.organizationId && group.organizationId !== effectiveOrgId) {
            return StatusResponse(res, 421, "Group is not in the workgroup's organization");
          }
        }
      }

      if (req.body.name) foundElection.name = req.body.name;
      if (req.body.description)
        foundElection.description = req.body.description;

      if (req.body.electionType)
        foundElection.electionType = req.body.electionType;
      if (req.body.groupId || req.body.groupId === null)
        foundElection.groupId = req.body.groupId;
      const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
        req,
        req.body.categoryId
      );
      if (!categoryResolution.ok) {
        return StatusResponse(
          res,
          categoryResolution.status,
          categoryResolution.message
        );
      }
      if (categoryResolution.hasValue) {
        foundElection.categoryId = categoryResolution.value;
      }
      if (req.body.statusId) foundElection.statusId = req.body.statusId;
      if (req.body.listId || req.body.listId === null)
        foundElection.listId = req.body.listId;
      if (req.body.imageId || req.body.imageId === null)
        foundElection.imageId = req.body.imageId;
      if (req.body.expiration) foundElection.expiration = req.body.expiration;
      if (normalizedWorkgroup.hasField) {
        foundElection.workgroupId = normalizedWorkgroup.value;
      }

      foundElection
        .save()
        .then((updatedElection) => {
          if (!updatedElection)
            return StatusResponse(res, 500, "Cannot update election");
          return StatusResponse(res, 200, "OK", {
            election: copyObject(updatedElection, Attributes.Election),
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putAddElection = async (req, res, next) => {
  const options = {};

  const electionToAdd = new Election();
  electionToAdd.name = req.body.name;
  electionToAdd.description = req.body.description;
  electionToAdd.id = UUID("election");
  electionToAdd.creator = req.authUserId;
  electionToAdd.workgroupId = null;

  let targetOrgId = null;
  const normalizedWorkgroup = normalizeOptionalId(req.body.workgroupId);
  if (normalizedWorkgroup.value) {
    const allowedWg = await Security.canAccessWorkgroup(req, normalizedWorkgroup.value);
    if (!allowedWg) return StatusResponse(res, 403, "Not authorized for this workgroup");
    targetOrgId = await getWorkgroupOrganizationId(normalizedWorkgroup.value);
    if (!targetOrgId) return StatusResponse(res, 404, "Workgroup not found");
    electionToAdd.workgroupId = normalizedWorkgroup.value;
  }

  if (req.body.listId) electionToAdd.listId = req.body.listId;
  if (req.body.electionType) electionToAdd.electionType = req.body.electionType;
  if (req.body.expiration) {
    electionToAdd.expiration =
      req.body.expiration.slice(0, 19).replace("T", " ") + "Z";
  }
  if (req.body.groupId) electionToAdd.groupId = req.body.groupId;
  const categoryResolution = await CategoryScope.resolveOwnedCategoryId(
    req,
    req.body.categoryId
  );
  if (!categoryResolution.ok) {
    return StatusResponse(
      res,
      categoryResolution.status,
      categoryResolution.message
    );
  }
  if (categoryResolution.hasValue) {
    electionToAdd.categoryId = categoryResolution.value;
  }

  const foundStatus = await Status.findOne({ where: { name: "Not Started" } });
  if (foundStatus) electionToAdd.statusId = foundStatus.id;

  // Validate referenced objects for workgroup-scoped elections.
  if (electionToAdd.workgroupId) {
    if (electionToAdd.listId) {
      const list = await List.findByPk(electionToAdd.listId, { raw: true });
      if (!list) return StatusResponse(res, 404, "List not found");
      if (!list.workgroupId || list.workgroupId !== electionToAdd.workgroupId) {
        return StatusResponse(res, 421, "List is not in the requested workgroup");
      }
    }
    if (electionToAdd.imageId) {
      const image = await Image.findByPk(electionToAdd.imageId, { raw: true });
      if (!image) return StatusResponse(res, 404, "Image not found");
      if (!image.workgroupId || image.workgroupId !== electionToAdd.workgroupId) {
        return StatusResponse(res, 421, "Image is not in the requested workgroup");
      }
    }
    if (electionToAdd.groupId) {
      const group = await Group.findByPk(electionToAdd.groupId, { raw: true });
      if (!group) return StatusResponse(res, 404, "Group not found");
      if (group.organizationId && targetOrgId && group.organizationId !== targetOrgId) {
        return StatusResponse(res, 421, "Group is not in the workgroup's organization");
      }
    }
  }

  const whereCondition = {};
  whereCondition.name = electionToAdd.name;
  if (electionToAdd.workgroupId) {
    whereCondition.workgroupId = electionToAdd.workgroupId;
  } else {
    whereCondition.creator = req.authUserId;
  }
  options.where = whereCondition;

  // Check for an election with the same name in this scope
  Election.findOne(options)
    .then((foundElection) => {
      if (foundElection)
        return StatusResponse(res, 421, "Election already exists");

      // Save the election to the database
      electionToAdd.save().then((addedElection) => {
        if (!addedElection)
          return StatusResponse(res, 400, "Cannot add election");

        return StatusResponse(res, 200, "OK", {
          election: copyObject(addedElection, Attributes.Election),
        });
      });
    })
    .catch((err) => {
      next(err);
    });
};

module.exports.deleteElection = (req, res, next) => {
  const electionToFind = req.params.electionId;
  const options = {};
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  let whereCondition = {};
  whereCondition.id = electionToFind;

  options.where = whereCondition;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      const allowed = await assertCanAccessElection(req, foundElection, "delete");
      if (!allowed)
        return StatusResponse(res, 403, "Not authorized for this election");

      // Delete any votes that were cast for this election
      Vote.destroy({ where: { electionId: foundElection.id } })
        .then(() => {
          foundElection
            .destroy()
            .then((electionDeleted) => {
              if (!electionDeleted)
                return StatusResponse(res, 500, "Cannot delete election");
              return StatusResponse(res, 200, "OK");
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putStartElection = (req, res, next) => {
  const options = {};
  const whereCondition = {};
  const electionToFind = req.params.electionId;

  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  whereCondition.id = electionToFind;

  whereCondition["$status.name$"] = "Not Started";

  const includes = generateIncludes("list,group");
  options.include = includes;

  options.where = whereCondition;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      const allowed = await assertCanAccessElection(req, foundElection, "edit");
      if (!allowed)
        return StatusResponse(res, 403, "Not authorized for this election");

      if (!(foundElection.group && foundElection.group.users))
        return StatusResponse(res, 404, "No voters configured");
      if (!(foundElection.list && foundElection.list.items))
        return StatusResponse(res, 404, "No items configured");

      // For each voter and each time, add an uncast vote
      const electionStartNotification = await getStatusIdByName(
        "Election Start"
      );
      const votesToAdd = [];
      for (const voter of foundElection.group.users) {
        await Notify.sendNotification(
          req.authUserId,
          voter.id,
          electionStartNotification,
          foundElection.id,
          req.authName + " started a vote."
        );
          for (const item of foundElection.list.items) {
          const vote = new Vote();

          vote.id = UUID("vote");
          vote.electionId = foundElection.id;
          vote.userId = voter.id;
          vote.itemId = item.id;
          vote.creator = req.authUserId;

          votesToAdd.push(vote);
        }
      }

      const voteErrors = [];
      // If there are votes to be added, add them
      for (const vote of votesToAdd) {
        await vote
          .save()
          .then(() => {})
          .catch((err) => {
            voteErrors.push({
              userId: vote.userId,
              listItemId: vote.listItemId,
              error: err,
            });
          });
      }

      // Do this last
      // Mark the election as started
      Status.findOne({ where: { name: "In Progress" } })
        .then((foundStatus) => {
          let statusId = 0;
          if (foundStatus) statusId = foundStatus.id;

          foundElection.statusId = statusId;
          foundElection
            .save()
            .then((electionSaved) => {
              return StatusResponse(res, 200, "OK", {
                votes: votesToAdd,
                errors: voteErrors,
                election: foundElection,
              });
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.putStopElection = (req, res, next) => {
  let options = {};
  let whereCondition = {};
  let includes = [];

  const electionToFind = req.params.electionId;
  if (!electionToFind)
    return StatusResponse(res, 421, "No election ID provided");

  whereCondition.id = electionToFind;

  includes = generateIncludes("list,group");

  whereCondition["$status.name$"] = "In Progress";
  options.where = whereCondition;

  options.include = includes;

  Election.findOne(options)
    .then(async (foundElection) => {
      if (!foundElection) return StatusResponse(res, 404, "Election not found");

      const allowed = await assertCanAccessElection(req, foundElection, "edit");
      if (!allowed)
        return StatusResponse(res, 403, "Not authorized for this election");

      options = {};
      whereCondition = {};

      const statusRecord = await Status.findOne({
        where: { name: "Pending" },
      });

      whereCondition.electionId = foundElection.id;
      whereCondition.statusId = statusRecord.id;

      options.where = whereCondition;

      // Find all the uncast votes to delete
      // Delete any votes that were cast for this election
      Vote.destroy(options)
        .then((destroyedStatus) => {
          // Mark the election as stopped
          Status.findOne({ where: { name: "Stopped" } })
            .then((foundStatus) => {
              let statusId = 0;
              if (foundStatus) statusId = foundStatus.id;

              foundElection.statusId = statusId;
              foundElection
                .save()
                .then(() => {
                  return StatusResponse(res, 200, "OK");
                })
                .catch((err) => next(err));
            })
            .catch((err) => next(err));
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.getStats = async (req, res, next) => {
  const electionToFind = req.params.electionId;
  let returnStats = {};

  if (!electionToFind)
    return StatusResponse(res, 421, "No election Id provided");

  let options = {};
  let whereCondition = {};
  const attributes = ["userId", "itemId"];

  whereCondition.electionId = electionToFind;

  const includes = [];
  includes.push({ model: Status, attributes: Attributes.Status });
  includes.push({ model: User, attributes: Attributes.StatsUser });
  includes.push({ model: Item, attributes: Attributes.StatsItem });

  options.where = whereCondition;
  options.include = includes;
  options.attributes = attributes;
  options.distinct = true;
  options.raw = true;

  Election.findByPk(electionToFind)
    .then(async (foundElection) => {
      if (!foundElection)
        return StatusResponse(res, 200, "OK", {
          hasElection: false,
          hasStats: false,
          statistics: [],
          lookup: [],
        });

      const allowed = await assertCanAccessElection(req, foundElection, "view");
      if (!allowed)
        return StatusResponse(res, 403, "Not authorized for this election");

      Vote.findAll(options)
        .then((result) => {
          if (!result || result.length === 0) {
            return StatusResponse(res, 200, "OK", {
              hasElection: true,
              hasStats: false,
              statistics: [],
              lookup: [],
            });
          }

          let statistics = { Results: {}, "By Voter": {} };
          let lookup = {};

          for (const r of result) {
            const statusName = r["status.name"];
            if (!statistics["Results"][r.itemId]) {
              statistics["Results"][r.itemId] = {};
            }
            if (!statistics["By Voter"][r.userId]) {
              statistics["By Voter"][r.userId] = {};
            }

            if (!statistics["Results"][r.itemId][statusName]) {
              statistics["Results"][r.itemId][statusName] = +0;
            }
            if (!statistics["By Voter"][r.userId][statusName]) {
              statistics["By Voter"][r.userId][statusName] = +0;
            }

            statistics["Results"][r.itemId][statusName] += 1;
            statistics["By Voter"][r.userId][statusName] += 1;

            if (!lookup[r.userId]) {
              lookup[r.userId] = r["user.name"];
            }
            if (!lookup[r.itemId]) {
              lookup[r.itemId] = r["item.name"];
            }
          }

          return StatusResponse(res, 200, "OK", {
            hasElection: true,
            hasStats: true,
            statistics: statistics,
            lookup: lookup,
          });
        })
        .catch((err) => next(err));
    })
    .catch((err) => next(err));
};

module.exports.getParticipation = async (req, res, next) => {
  try {
    const electionToFind = req.params.electionId;
    if (!electionToFind) {
      return StatusResponse(res, 421, "No election Id provided");
    }

    const foundElection = await Election.findByPk(electionToFind, {
      attributes: [
        "id",
        "name",
        "description",
        "expiration",
        "groupId",
        "listId",
        "workgroupId",
        "creator",
      ],
      raw: true,
    });
    if (!foundElection) return StatusResponse(res, 404, "Election not found");

    const allowed = await assertCanAccessElection(req, foundElection, "view");
    if (!allowed) {
      return StatusResponse(res, 403, "Not authorized for this election");
    }

    const summary = await buildParticipationSummary(foundElection);
    return StatusResponse(res, 200, "OK", {
      election: {
        id: foundElection.id,
        name: foundElection.name,
        description: foundElection.description,
        expiration: foundElection.expiration,
        groupId: foundElection.groupId,
        listId: foundElection.listId,
        workgroupId: foundElection.workgroupId,
      },
      ...(summary || {
        audience: { group: null, list: null, expectedParticipants: 0, participants: [] },
        participation: {
          expectedParticipants: 0,
          notStartedCount: 0,
          inProgressCount: 0,
          completedCount: 0,
          followUpCount: 0,
          totalVotes: 0,
          castVotes: 0,
          pendingVotes: 0,
          completionRate: 0,
        },
      }),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postParticipationReminder = async (req, res, next) => {
  try {
    const electionToFind = req.params.electionId;
    if (!electionToFind) return StatusResponse(res, 421, "No election Id provided");

    const foundElection = await Election.findByPk(electionToFind, {
      attributes: [
        "id",
        "name",
        "description",
        "expiration",
        "groupId",
        "listId",
        "workgroupId",
        "creator",
      ],
      raw: true,
    });
    if (!foundElection) return StatusResponse(res, 404, "Election not found");

    const allowed = await assertCanAccessElection(req, foundElection, "edit");
    if (!allowed) return StatusResponse(res, 403, "Not authorized for this election");

    const summary = await buildParticipationSummary(foundElection);
    const participantList = summary?.audience?.participants || [];
    const requestedStates = normalizeReminderStates(req.body?.states || req.body?.state);
    const requestedUserIds = normalizeReminderUserIds(req.body?.userIds);
    const customMessage =
      req.body?.message === undefined || req.body?.message === null
        ? null
        : req.body.message.toString().trim() || null;

    const targets = participantList.filter((participant) => {
      if (!participant?.id) return false;
      if (participant.id === req.authUserId) return false;
      if (!requestedStates.includes(participant.state)) return false;
      if (requestedUserIds.length && !requestedUserIds.includes(participant.id)) return false;
      return true;
    });

    const reminderTypeId = await getStatusIdByName(PARTICIPATION_REMINDER_STATUS);
    if (!reminderTypeId || reminderTypeId < 0) {
      return StatusResponse(res, 500, "Election participation reminder status is not configured");
    }

    const results = [];
    for (const participant of targets) {
      const text = buildReminderText(foundElection, req.authName, customMessage);
      await Notify.sendNotification(
        req.authUserId,
        participant.id,
        reminderTypeId,
        foundElection.id,
        text
      );
      results.push({
        userId: participant.id,
        state: participant.state,
        status: 200,
        message: "Reminder sent",
      });
    }

    return StatusResponse(res, 200, "OK", {
      election: {
        id: foundElection.id,
        name: foundElection.name,
      },
      reminder: {
        targetStates: requestedStates,
        targetUserIds: requestedUserIds,
        customMessage,
        targetCount: targets.length,
        sentCount: results.length,
      },
      results,
    });
  } catch (err) {
    next(err);
  }
};

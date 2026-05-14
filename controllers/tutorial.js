const { Op } = require("sequelize");

const UUID = require("../util/mini-uuid");
const StatusResponse = require("../util/statusresponse");
const { getStatusIdByName } = require("../util/helpers");

const Preference = require("../model/preference");
const Item = require("../model/item");
const List = require("../model/list");
const ListItem = require("../model/listitem");
const Group = require("../model/group");
const GroupMember = require("../model/groupmember");
const Election = require("../model/election");
const Vote = require("../model/vote");
const Status = require("../model/status");
const User = require("../model/user");

const TUTORIAL_PREFERENCE_NAME = "tutorial.poll.create";
const TUTORIAL_VERSION = 1;

function parseTutorialValue(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function buildTutorialNames(suffix) {
  return {
    listName: `Tutorial Ideas ${suffix}`,
    groupName: `Tutorial Circle ${suffix}`,
    electionName: `Tutorial Poll ${suffix}`,
  };
}

function buildTutorialSteps(progress, names = {}, bindings = {}) {
  const listRef = bindings.listId || null;
  const groupRef = bindings.groupId || null;
  const electionRef = bindings.electionId || null;

  return [
    {
      key: "create_options_list",
      title: "Create an ideas list",
      complete: progress.listCreated === true,
      resourceType: "list",
      suggestedName: names.listName || null,
      resourceId: listRef,
      detail: "Use the existing list UI and create a real list with the suggested name.",
    },
    {
      key: "add_items",
      title: "Create at least two items and add them to the list",
      complete: progress.createdItemsAddedCount >= 2,
      resourceType: "item",
      suggestedCount: 2,
      resourceId: listRef,
      detail: "Create real items in the existing item UI, then add them to your tutorial list.",
    },
    {
      key: "create_audience",
      title: "Create a circle",
      complete: progress.groupCreated === true,
      resourceType: "group",
      suggestedName: names.groupName || null,
      resourceId: groupRef,
      detail: "Use the circle UI and create a real circle with the suggested name.",
    },
    {
      key: "add_yourself_to_audience",
      title: "Add yourself to the circle",
      complete: progress.selfInAudience === true,
      resourceType: "group",
      resourceId: groupRef,
      detail: "Add yourself to the circle so the poll can generate real votes.",
    },
    {
      key: "create_poll",
      title: "Create the poll",
      complete: progress.electionCreated === true,
      resourceType: "election",
      suggestedName: names.electionName || null,
      resourceId: electionRef,
      detail: "Create a real poll that uses the tutorial ideas list and tutorial circle.",
    },
    {
      key: "start_poll",
      title: "Start the poll",
      complete: progress.electionStarted === true,
      resourceType: "election",
      resourceId: electionRef,
      detail: "Start the poll in the existing UI so votes are generated for the audience.",
    },
    {
      key: "cast_vote",
      title: "Cast one vote",
      complete: progress.castVoteCount > 0,
      resourceType: "vote",
      resourceId: electionRef,
      detail: "Use the existing voting UI to submit at least one real vote on the tutorial poll.",
    },
    {
      key: "view_stats",
      title: "Open stats and participation",
      complete: progress.hasStats === true,
      resourceType: "election",
      resourceId: electionRef,
      detail: "Open the poll stats and participation views to inspect the real results from your tutorial poll.",
    },
  ];
}

function createTutorialSession() {
  const suffix = UUID("tutorial").split("_").pop().slice(0, 6).toUpperCase();
  return {
    version: TUTORIAL_VERSION,
    status: "active",
    startedAt: new Date().toISOString(),
    skippedAt: null,
    dismissedAt: null,
    names: buildTutorialNames(suffix),
    bindings: {
      listId: null,
      groupId: null,
      electionId: null,
    },
  };
}

function summarizeTutorial(session, bindings, progress) {
  const steps = buildTutorialSteps(progress, session.names, bindings);
  const completedSteps = steps.filter((step) => step.complete).length;
  const nextStep = steps.find((step) => !step.complete) || null;
  const status =
    session.status === "dismissed"
      ? "dismissed"
      : session.status === "skipped"
        ? "skipped"
        : nextStep
          ? "active"
          : "completed";

  return {
    key: TUTORIAL_PREFERENCE_NAME,
    version: TUTORIAL_VERSION,
    status,
    startedAt: session.startedAt || null,
    skippedAt: session.skippedAt || null,
    dismissedAt: session.dismissedAt || null,
    names: session.names,
    bindings,
    progress: {
      ...progress,
      completedSteps,
      totalSteps: steps.length,
      completionRate: steps.length ? Math.round((completedSteps / steps.length) * 100) : 0,
    },
    nextStepKey: status === "skipped" || status === "dismissed" ? null : nextStep ? nextStep.key : null,
    steps,
  };
}

async function findTutorialResourceByName(Model, creator, name, extraWhere = {}) {
  if (!creator || !name) return null;
  return Model.findOne({
    where: {
      creator,
      name,
      ...extraWhere,
    },
    order: [["createdAt", "ASC"], ["updatedAt", "ASC"]],
    raw: true,
  });
}

async function loadTutorialPreference(userId) {
  if (!userId) return null;
  return Preference.findOne({
    where: {
      creator: userId,
      name: TUTORIAL_PREFERENCE_NAME,
    },
    raw: false,
  });
}

async function saveTutorialPreference(record, session, userId) {
  const serialized = JSON.stringify(session);
  if (record) {
    record.value = serialized;
    await record.save();
    return record;
  }

  return Preference.create({
    id: UUID("pref"),
    name: TUTORIAL_PREFERENCE_NAME,
    value: serialized,
    creator: userId,
  });
}

async function enableTutorialPreference(record, userId, { restart = false } = {}) {
  const baseSession = restart
    ? createTutorialSession()
    : {
        ...(parseTutorialValue(record?.value) || createTutorialSession()),
        status: "active",
        skippedAt: null,
        dismissedAt: null,
      };
  return saveTutorialPreference(record, baseSession, userId);
}

async function authorizeTutorialAdminTarget(req, userId) {
  if (!userId) return { error: "No user ID provided", code: 421 };

  const targetUser = await User.findByPk(userId, {
    attributes: ["id", "organizationId"],
    raw: true,
  });
  if (!targetUser) return { error: "User not found", code: 404 };

  if (req.isAdmin === true) return { targetUser };
  if (
    req.isOrganizationAdmin === true &&
    req.authOrganizationId &&
    targetUser.organizationId === req.authOrganizationId
  ) {
    return { targetUser };
  }

  return { error: "Not authorized for this user", code: 403 };
}

async function resolveTutorialState(req, record) {
  const session = parseTutorialValue(record?.value);
  if (!session || !session.names) return null;

  const bindings = {
    listId: session.bindings?.listId || null,
    groupId: session.bindings?.groupId || null,
    electionId: session.bindings?.electionId || null,
  };

  let list = bindings.listId ? await List.findByPk(bindings.listId, { raw: true }) : null;
  if (!list) {
    list = await findTutorialResourceByName(List, req.authUserId, session.names.listName);
    bindings.listId = list?.id || null;
  }

  let group = bindings.groupId ? await Group.findByPk(bindings.groupId, { raw: true }) : null;
  if (!group) {
    group = await findTutorialResourceByName(Group, req.authUserId, session.names.groupName);
    bindings.groupId = group?.id || null;
  }

  let election = bindings.electionId ? await Election.findByPk(bindings.electionId, { raw: true }) : null;
  if (!election) {
    const electionByName = await findTutorialResourceByName(Election, req.authUserId, session.names.electionName);
    if (electionByName) {
      if (
        (!list || electionByName.listId === list.id) &&
        (!group || electionByName.groupId === group.id)
      ) {
        election = electionByName;
      }
    }
    bindings.electionId = election?.id || null;
  }

  const startedAfter = session.startedAt ? new Date(session.startedAt) : new Date(0);
  const listItemRows = bindings.listId
    ? await ListItem.findAll({
        where: { listId: bindings.listId },
        attributes: ["itemId"],
        raw: true,
      })
    : [];
  const tutorialItemIds = [...new Set((listItemRows || []).map((row) => row.itemId).filter(Boolean))];
  const createdItemsAddedCount = tutorialItemIds.length
    ? await Item.count({
        where: {
          id: { [Op.in]: tutorialItemIds },
          creator: req.authUserId,
          createdAt: { [Op.gte]: startedAfter },
        },
      })
    : 0;
  const totalListItemCount = tutorialItemIds.length;

  const audienceMemberCount = bindings.groupId
    ? await GroupMember.count({ where: { groupId: bindings.groupId } })
    : 0;
  const selfInAudience = bindings.groupId
    ? (await GroupMember.count({
        where: {
          groupId: bindings.groupId,
          userId: req.authUserId,
        },
      })) > 0
    : false;

  const pendingStatusId = await getStatusIdByName("Pending");
  const electionStatus = election?.statusId
    ? await Status.findByPk(election.statusId, { raw: true })
    : null;
  const totalVoteCount = bindings.electionId
    ? await Vote.count({ where: { electionId: bindings.electionId } })
    : 0;
  const castVoteCount = bindings.electionId
    ? await Vote.count({
        where: {
          electionId: bindings.electionId,
          userId: req.authUserId,
          ...(pendingStatusId >= 0 ? { statusId: { [Op.ne]: pendingStatusId } } : {}),
        },
      })
    : 0;

  const progress = {
    listCreated: !!list,
    totalListItemCount,
    createdItemsAddedCount,
    groupCreated: !!group,
    audienceMemberCount,
    selfInAudience,
    electionCreated:
      !!election &&
      (!list || election.listId === list.id) &&
      (!group || election.groupId === group.id),
    electionStarted:
      !!electionStatus &&
      ["In Progress", "Ended", "Stopped"].includes(electionStatus.name),
    electionStatus: electionStatus?.name || null,
    totalVoteCount,
    castVoteCount,
    hasStats: castVoteCount > 0,
  };

  const didBindingsChange =
    bindings.listId !== (session.bindings?.listId || null) ||
    bindings.groupId !== (session.bindings?.groupId || null) ||
    bindings.electionId !== (session.bindings?.electionId || null);

  const summary = summarizeTutorial(session, bindings, progress);
  return {
    session,
    bindings,
    progress,
    summary,
    didBindingsChange,
  };
}

module.exports.getPollTutorial = async (req, res, next) => {
  try {
    const record = await loadTutorialPreference(req.authUserId);
    if (!record) return StatusResponse(res, 404, "Poll tutorial not started");

    const resolved = await resolveTutorialState(req, record);
    if (!resolved) return StatusResponse(res, 404, "Poll tutorial not started");

    const sessionStatus = resolved.summary.status;
    if (sessionStatus !== resolved.session.status || resolved.didBindingsChange) {
      resolved.session.status = sessionStatus;
      resolved.session.bindings = resolved.bindings;
      await saveTutorialPreference(record, resolved.session, req.authUserId);
    }

    return StatusResponse(res, 200, "OK", {
      tutorial: resolved.summary,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postStartPollTutorial = async (req, res, next) => {
  try {
    const existingRecord = await loadTutorialPreference(req.authUserId);
    const restart = req.body?.restart === true;
    if (existingRecord && !restart) {
      const resolved = await resolveTutorialState(req, existingRecord);
      if (resolved) {
        return StatusResponse(res, 200, "OK", {
          tutorial: resolved.summary,
        });
      }
    }

    const session = createTutorialSession();

    const savedRecord = await saveTutorialPreference(existingRecord, session, req.authUserId);
    const resolved = await resolveTutorialState(req, savedRecord);
    return StatusResponse(res, 200, "OK", {
      tutorial: resolved ? resolved.summary : summarizeTutorial(session, session.bindings, {
        listCreated: false,
        totalListItemCount: 0,
        createdItemsAddedCount: 0,
        groupCreated: false,
        audienceMemberCount: 0,
        selfInAudience: false,
        electionCreated: false,
        electionStarted: false,
        electionStatus: null,
        totalVoteCount: 0,
        castVoteCount: 0,
        hasStats: false,
      }),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postSkipPollTutorial = async (req, res, next) => {
  try {
    const existingRecord = await loadTutorialPreference(req.authUserId);
    if (!existingRecord) return StatusResponse(res, 404, "Poll tutorial not started");

    const session = parseTutorialValue(existingRecord.value);
    if (!session || !session.names) return StatusResponse(res, 404, "Poll tutorial not started");

    session.status = "skipped";
    session.skippedAt = new Date().toISOString();
    const savedRecord = await saveTutorialPreference(existingRecord, session, req.authUserId);
    const resolved = await resolveTutorialState(req, savedRecord);
    return StatusResponse(res, 200, "OK", {
      tutorial: resolved ? resolved.summary : summarizeTutorial(session, session.bindings || {}, {
        listCreated: false,
        totalListItemCount: 0,
        createdItemsAddedCount: 0,
        groupCreated: false,
        audienceMemberCount: 0,
        selfInAudience: false,
        electionCreated: false,
        electionStarted: false,
        electionStatus: null,
        totalVoteCount: 0,
        castVoteCount: 0,
        hasStats: false,
      }),
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postDismissPollTutorial = async (req, res, next) => {
  try {
    const existingRecord = await loadTutorialPreference(req.authUserId);
    const session = parseTutorialValue(existingRecord?.value) || createTutorialSession();

    session.status = "dismissed";
    session.dismissedAt = new Date().toISOString();

    await saveTutorialPreference(existingRecord, session, req.authUserId);
    return StatusResponse(res, 200, "OK", {
      dismissed: true,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postEnablePollTutorial = async (req, res, next) => {
  try {
    const existingRecord = await loadTutorialPreference(req.authUserId);
    const restart = req.body?.restart === true;
    const savedRecord = await enableTutorialPreference(existingRecord, req.authUserId, {
      restart,
    });
    const resolved = await resolveTutorialState(req, savedRecord);
    return StatusResponse(res, 200, "OK", {
      tutorial: resolved ? resolved.summary : null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.postEnablePollTutorialForUser = async (req, res, next) => {
  try {
    const authorized = await authorizeTutorialAdminTarget(req, req.params.userId);
    if (authorized.error) {
      return StatusResponse(res, authorized.code || 403, authorized.error);
    }

    const existingRecord = await loadTutorialPreference(req.params.userId);
    const restart = req.body?.restart === true;
    const savedRecord = await enableTutorialPreference(existingRecord, req.params.userId, {
      restart,
    });

    const proxyReq = {
      ...req,
      authUserId: req.params.userId,
    };
    const resolved = await resolveTutorialState(proxyReq, savedRecord);
    return StatusResponse(res, 200, "OK", {
      tutorial: resolved ? resolved.summary : null,
      userId: req.params.userId,
    });
  } catch (err) {
    next(err);
  }
};

const { Op } = require("sequelize");

const Config = require("../config/wotlwedu");
const StatusResponse = require("../util/statusresponse");
const Security = require("../util/security");
const { normalizeOptionalId } = require("../util/idnormalize");
const { getStatusIdByName } = require("../util/helpers");

const Election = require("../model/election");
const Vote = require("../model/vote");
const User = require("../model/user");
const Group = require("../model/group");
const List = require("../model/list");
const ListItem = require("../model/listitem");
const Item = require("../model/item");
const Image = require("../model/image");
const Status = require("../model/status");
const Notification = require("../model/notification");

const QUICK_TEMPLATES = [
  {
    id: "food",
    label: "Dinner plan",
    title: "Where should we eat?",
    description: "Start with pizza, sushi, tacos, and a wild card.",
  },
  {
    id: "movies",
    label: "Movie night",
    title: "What should we watch?",
    description: "Line up a few shows or movies and let the group decide.",
  },
  {
    id: "travel",
    label: "Weekend trip",
    title: "Where should we go?",
    description: "Compare beach, mountains, city, and road-trip ideas.",
  },
  {
    id: "team-lunch",
    label: "Team lunch",
    title: "Team lunch plan",
    description: "Pick something easy for the team to agree on.",
  },
];

function displayName(user) {
  if (!user) return "Someone";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.alias || user.email || user.id || "Someone";
}

function imageUrl(image) {
  if (!image?.filename) return null;
  return Config.imageURL + image.filename;
}

function initials(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "W";
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function uniqueElectionIds(rows) {
  return [...new Set((rows || []).map((row) => row.electionId).filter(Boolean))];
}

async function buildVisibleElectionWhere(req, workgroupId) {
  const voteRows = await Vote.findAll({
    where: { userId: req.authUserId },
    attributes: ["electionId"],
    raw: true,
  });
  const assignedElectionIds = uniqueElectionIds(voteRows);
  const ownOrAssigned = [{ creator: req.authUserId }];
  if (assignedElectionIds.length) {
    ownOrAssigned.push({ id: { [Op.in]: assignedElectionIds } });
  }

  const where = { [Op.or]: ownOrAssigned };
  if (workgroupId) where.workgroupId = workgroupId;
  return where;
}

async function loadElectionsByIds(ids) {
  const cleanIds = [...new Set((ids || []).filter(Boolean))];
  if (!cleanIds.length) return [];
  const rows = await Election.findAll({
    where: { id: { [Op.in]: cleanIds } },
    order: [["updatedAt", "DESC"]],
    raw: true,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return cleanIds.map((id) => byId.get(id)).filter(Boolean);
}

async function loadStatusMap() {
  const rows = await Status.findAll({ raw: true });
  return new Map((rows || []).map((row) => [row.id, row.name]));
}

async function buildPollCard(election, statusMap, options = {}) {
  if (!election) return null;

  const [
    creator,
    group,
    list,
    voteRows,
    directImage,
  ] = await Promise.all([
    election.creator ? User.findByPk(election.creator, { raw: true }) : null,
    election.groupId ? Group.findByPk(election.groupId, { raw: true }) : null,
    election.listId ? List.findByPk(election.listId, { raw: true }) : null,
    Vote.findAll({
      where: { electionId: election.id },
      attributes: ["userId", "itemId", "statusId", "updatedAt"],
      raw: true,
    }),
    election.imageId ? Image.findByPk(election.imageId, { raw: true }) : null,
  ]);

  const listItems = election.listId
    ? await ListItem.findAll({
        where: { listId: election.listId },
        attributes: ["itemId"],
        limit: 4,
        raw: true,
      })
    : [];
  const itemIds = (listItems || []).map((row) => row.itemId).filter(Boolean);
  const items = itemIds.length
    ? await Item.findAll({
        where: { id: { [Op.in]: itemIds } },
        attributes: ["id", "name", "description", "imageId"],
        raw: true,
      })
    : [];
  const itemById = new Map((items || []).map((item) => [item.id, item]));
  const orderedItems = itemIds.map((id) => itemById.get(id)).filter(Boolean);
  const firstItemImageId = orderedItems.find((item) => item.imageId)?.imageId;
  const firstItemImage = firstItemImageId
    ? await Image.findByPk(firstItemImageId, { raw: true })
    : null;

  const participantIds = [...new Set((voteRows || []).map((row) => row.userId).filter(Boolean))];
  const pendingStatusId = await getStatusIdByName("Pending");
  const yesStatusId = await getStatusIdByName("Yes");
  const pendingVotes = (voteRows || []).filter((row) => row.statusId === pendingStatusId).length;
  const castVotes = Math.max((voteRows || []).length - pendingVotes, 0);
  const completionRate = voteRows?.length ? Math.round((castVotes / voteRows.length) * 100) : 0;
  const yesCounts = new Map();
  for (const vote of voteRows || []) {
    if (vote.statusId !== yesStatusId) continue;
    yesCounts.set(vote.itemId, (yesCounts.get(vote.itemId) || 0) + 1);
  }
  const winnerEntry = [...yesCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const winnerItem = winnerEntry ? itemById.get(winnerEntry[0]) : null;
  const creatorName = displayName(creator);
  const cardImage = imageUrl(directImage) || imageUrl(firstItemImage);
  const statusName = statusMap.get(election.statusId) || "Open";

  return {
    id: election.id,
    name: election.name,
    description: election.description,
    expiration: election.expiration,
    updatedAt: election.updatedAt,
    createdAt: election.createdAt,
    status: {
      id: election.statusId,
      name: statusName,
    },
    creator: creator
      ? {
          id: creator.id,
          name: creatorName,
          initials: initials(creatorName),
          imageUrl: null,
        }
      : null,
    audience: group
      ? {
          id: group.id,
          name: group.name,
        }
      : null,
    list: list
      ? {
          id: list.id,
          name: list.name,
        }
      : null,
    imageUrl: cardImage,
    ideas: orderedItems.slice(0, 3).map((item) => ({
      id: item.id,
      name: item.name,
    })),
    participantCount: participantIds.length,
    voteCount: (voteRows || []).length,
    castVotes,
    pendingVotes,
    completionRate,
    winner: winnerItem
      ? {
          id: winnerItem.id,
          name: winnerItem.name,
          yesVotes: winnerEntry[1],
        }
      : null,
    pendingVoteId: options.pendingVoteId || null,
    action: options.action || {
      label: statusName === "Ended" ? "View Results" : "View Results",
      href: `/app/statistics/${election.id}`,
    },
  };
}

async function buildPollCards(elections, statusMap, optionsByElectionId = {}) {
  const cards = [];
  for (const election of elections || []) {
    const card = await buildPollCard(election, statusMap, optionsByElectionId[election.id] || {});
    if (card) cards.push(card);
  }
  return cards;
}

function buildPollActivity(card, type) {
  if (!card) return null;
  const creatorName = card.creator?.name || "Someone";
  if (type === "winner") {
    return {
      id: `winner:${card.id}`,
      type: "winner",
      title: `${card.winner?.name || card.name} won ${card.name}`,
      text: `${card.participantCount || 0} people took part.`,
      createdAt: card.updatedAt,
      actor: card.creator,
      poll: card,
      href: `/app/statistics/${card.id}`,
    };
  }
  return {
    id: `poll:${card.id}`,
    type: "poll_created",
    title: `${creatorName} started ${card.name}`,
    text: card.description || "A new poll is ready for the group.",
    createdAt: card.createdAt || card.updatedAt,
    actor: card.creator,
    poll: card,
    href: card.action?.href || `/app/statistics/${card.id}`,
  };
}

exports.getHome = async (req, res, next) => {
  try {
    const requestedWorkgroupId = normalizeOptionalId(req.query.workgroupId).value;
    if (requestedWorkgroupId) {
      const allowed = await Security.canAccessWorkgroup(req, requestedWorkgroupId);
      if (!allowed) return StatusResponse(res, 403, "Not authorized for this workgroup");
    }

    const [pendingStatusId, endedStatusId, unreadStatusId, statusMap] = await Promise.all([
      getStatusIdByName("Pending"),
      getStatusIdByName("Ended"),
      getStatusIdByName("Unread"),
      loadStatusMap(),
    ]);

    const pendingVoteRows = await Vote.findAll({
      where: {
        userId: req.authUserId,
        statusId: pendingStatusId,
      },
      attributes: ["id", "electionId", "updatedAt"],
      order: [["updatedAt", "DESC"]],
      limit: 12,
      raw: true,
    });
    const pendingElectionIds = uniqueElectionIds(pendingVoteRows);
    const pendingByElectionId = new Map();
    for (const vote of pendingVoteRows) {
      if (!pendingByElectionId.has(vote.electionId)) {
        pendingByElectionId.set(vote.electionId, vote);
      }
    }

    const visibleWhere = await buildVisibleElectionWhere(req, requestedWorkgroupId);
    const now = new Date();
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [
      needsVoteElections,
      closingSoonElections,
      recentPolls,
      endedPolls,
      unreadNotificationCount,
      recentLists,
      recentGroups,
    ] = await Promise.all([
      loadElectionsByIds(pendingElectionIds),
      Election.findAll({
        where: {
          ...visibleWhere,
          expiration: { [Op.between]: [now, soon] },
          ...(endedStatusId ? { statusId: { [Op.ne]: endedStatusId } } : {}),
        },
        order: [["expiration", "ASC"]],
        limit: 6,
        raw: true,
      }),
      Election.findAll({
        where: visibleWhere,
        order: [["createdAt", "DESC"]],
        limit: 6,
        raw: true,
      }),
      endedStatusId
        ? Election.findAll({
            where: {
              ...visibleWhere,
              statusId: endedStatusId,
            },
            order: [["updatedAt", "DESC"]],
            limit: 6,
            raw: true,
          })
        : [],
      unreadStatusId
        ? Notification.count({ where: { userId: req.authUserId, statusId: unreadStatusId } })
        : 0,
      List.findAll({
        where: {
          creator: req.authUserId,
          ...(requestedWorkgroupId ? { workgroupId: requestedWorkgroupId } : {}),
        },
        order: [["updatedAt", "DESC"]],
        limit: 3,
        raw: true,
      }),
      Group.findAll({
        where: {
          creator: req.authUserId,
          ...(req.authOrganizationId ? { organizationId: req.authOrganizationId } : {}),
        },
        order: [["updatedAt", "DESC"]],
        limit: 3,
        raw: true,
      }),
    ]);

    const needsVote = await buildPollCards(
      needsVoteElections,
      statusMap,
      Object.fromEntries(
        [...pendingByElectionId.entries()].map(([electionId, vote]) => [
          electionId,
          {
            pendingVoteId: vote.id,
            action: {
              label: "Vote",
              href: `/app/cast-vote/${electionId}`,
            },
          },
        ])
      )
    );
    const closingSoon = await buildPollCards(closingSoonElections, statusMap);
    const recentCards = await buildPollCards(recentPolls, statusMap);
    const recentWinners = await buildPollCards(endedPolls, statusMap);

    const friendActivity = [
      ...needsVote.slice(0, 2).map((card) => ({
        id: `need:${card.id}`,
        type: "needs_vote",
        title: `${card.name} needs your vote`,
        text: card.ideas.length
          ? `Ideas include ${card.ideas.map((idea) => idea.name).join(", ")}.`
          : "Open the poll and help the group decide.",
        createdAt: card.updatedAt,
        actor: card.creator,
        poll: card,
        href: `/app/cast-vote/${card.id}`,
      })),
      ...recentCards.slice(0, 4).map((card) => buildPollActivity(card, "created")),
      ...recentWinners.filter((card) => card.winner).slice(0, 3).map((card) => buildPollActivity(card, "winner")),
    ].filter(Boolean).slice(0, 8);

    return StatusResponse(res, 200, "OK", {
      home: {
        generatedAt: new Date().toISOString(),
        workgroupId: requestedWorkgroupId || null,
        unreadNotificationCount,
        needsVote: needsVote.slice(0, 6),
        closingSoon: closingSoon.slice(0, 6),
        friendActivity,
        recentWinners: recentWinners.slice(0, 6),
        quickStarts: {
          templates: QUICK_TEMPLATES,
          recentLists: (recentLists || []).map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
          })),
          recentCircles: (recentGroups || []).map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
          })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

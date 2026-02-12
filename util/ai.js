const CATEGORY_KEYWORDS = {
  Food: [
    "food",
    "eat",
    "dinner",
    "lunch",
    "breakfast",
    "restaurant",
    "pizza",
    "burger",
    "sushi",
    "coffee",
    "snack",
    "drink",
  ],
  Entertainment: [
    "movie",
    "film",
    "show",
    "music",
    "game",
    "board game",
    "stream",
    "watch",
    "concert",
    "podcast",
  ],
  Travel: [
    "travel",
    "trip",
    "vacation",
    "flight",
    "hotel",
    "road trip",
    "beach",
    "park",
    "destination",
  ],
  Activity: [
    "activity",
    "hike",
    "walk",
    "workout",
    "run",
    "gym",
    "sports",
    "adventure",
    "outdoor",
  ],
  Shopping: [
    "buy",
    "shop",
    "purchase",
    "store",
    "deal",
    "wishlist",
    "gift",
  ],
};

const SUGGESTION_LIBRARY = {
  Food: [
    "Try a local taco spot",
    "Plan a ramen night",
    "Compare two pizza places",
    "Build a brunch shortlist",
    "Pick a healthy bowl option",
    "Test a new sandwich cafe",
    "Vote on dessert destinations",
  ],
  Entertainment: [
    "Pick a movie for group watch",
    "Create a game night bracket",
    "Compare comedy specials",
    "Select a new series pilot",
    "Vote on a live concert stream",
    "Choose a podcast episode set",
  ],
  Travel: [
    "Shortlist nearby weekend trips",
    "Compare budget-friendly hotels",
    "Pick top local day-trip stops",
    "Rank scenic routes",
    "Choose a beach getaway option",
  ],
  Activity: [
    "Choose a weekend hike trail",
    "Pick a casual sports meetup",
    "Plan a walking route challenge",
    "Vote on fitness class options",
    "Select an outdoor activity plan",
  ],
  Shopping: [
    "Compare gift ideas under budget",
    "Pick top home office upgrades",
    "Vote on kitchen essentials",
    "Rank tech accessory options",
    "Select best-value purchases",
  ],
  General: [
    "Create a quick top-5 shortlist",
    "Compare options by cost and effort",
    "Rank ideas by group interest",
    "Pick options with strongest consensus",
    "Filter ideas by time available",
  ],
};

const MODERATION_TERMS = {
  violence: ["kill", "murder", "bomb", "shoot", "terror"],
  hate: ["racist", "slur", "genocide"],
  selfHarm: ["suicide", "self-harm"],
  explicit: ["rape", "sexual assault"],
};

function normaliseText(text) {
  if (!text) return "";
  return String(text).toLowerCase();
}

function toWordRegex(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function inferCategory(text) {
  const normalized = normaliseText(text);
  if (!normalized) {
    return { category: "General", confidence: 0, matches: [] };
  }

  let bestCategory = "General";
  let bestScore = 0;
  let totalMatches = 0;
  let bestMatches = [];

  Object.keys(CATEGORY_KEYWORDS).forEach((categoryName) => {
    const matches = CATEGORY_KEYWORDS[categoryName].filter((term) =>
      toWordRegex(term).test(normalized)
    );

    const score = matches.length;
    totalMatches += score;

    if (score > bestScore) {
      bestCategory = categoryName;
      bestScore = score;
      bestMatches = matches;
    }
  });

  if (bestScore === 0) {
    return { category: "General", confidence: 0.15, matches: [] };
  }

  const confidence = Number((bestScore / Math.max(totalMatches, 1)).toFixed(2));
  return {
    category: bestCategory,
    confidence,
    matches: bestMatches,
  };
}

function textSeed(text) {
  const normalized = normaliseText(text);
  if (!normalized) return 0;
  return normalized.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function boundCount(count, min, max, fallback) {
  const parsed = Number.parseInt(count, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function generateListSuggestions(prompt, requestedCount) {
  const count = boundCount(requestedCount, 1, 10, 5);
  const categoryResult = inferCategory(prompt);
  const category = categoryResult.category;

  const pool = SUGGESTION_LIBRARY[category] || SUGGESTION_LIBRARY.General;
  const seed = textSeed(prompt);
  const offset = pool.length ? seed % pool.length : 0;

  const suggestions = [];
  for (let index = 0; index < pool.length; index += 1) {
    const suggestion = pool[(index + offset) % pool.length];
    if (!suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
    if (suggestions.length >= count) break;
  }

  return {
    category,
    confidence: categoryResult.confidence,
    count: suggestions.length,
    suggestions: suggestions.map((name) => ({
      name,
      reason: `Inferred ${category.toLowerCase()} intent from prompt`,
    })),
  };
}

function categorizeText(text) {
  const category = inferCategory(text);
  return {
    category: category.category,
    confidence: category.confidence,
    matches: category.matches,
  };
}

function moderateText(text) {
  const normalized = normaliseText(text);
  const flaggedTerms = [];

  Object.keys(MODERATION_TERMS).forEach((policyArea) => {
    MODERATION_TERMS[policyArea].forEach((term) => {
      if (toWordRegex(term).test(normalized)) {
        flaggedTerms.push({
          term,
          policyArea,
        });
      }
    });
  });

  let severity = "none";
  if (flaggedTerms.length > 0) severity = "low";
  if (flaggedTerms.length >= 2) severity = "medium";
  if (
    flaggedTerms.some((entry) =>
      ["selfHarm", "explicit", "hate", "violence"].includes(entry.policyArea)
    ) &&
    flaggedTerms.length >= 3
  ) {
    severity = "high";
  }

  return {
    safe: flaggedTerms.length === 0,
    severity,
    flaggedTerms,
  };
}

function recommendElectionItems({ election, items, votes, userId }) {
  const voteCountByItemId = {};
  const votedByUser = new Set();

  votes.forEach((vote) => {
    if (!voteCountByItemId[vote.itemId]) {
      voteCountByItemId[vote.itemId] = 0;
    }
    voteCountByItemId[vote.itemId] += 1;

    if (vote.userId === userId) {
      votedByUser.add(vote.itemId);
    }
  });

  const electionText = `${election.name || ""} ${election.description || ""}`;
  const electionCategory = inferCategory(electionText).category;

  const ranked = items
    .filter((item) => !votedByUser.has(item.id))
    .map((item) => {
      const itemText = `${item.name || ""} ${item.description || ""}`;
      const itemCategory = inferCategory(itemText).category;
      const peerVotes = voteCountByItemId[item.id] || 0;
      const categoryBonus = itemCategory === electionCategory ? 2 : 0;
      const score = peerVotes * 3 + categoryBonus;

      return {
        itemId: item.id,
        name: item.name,
        score,
        reason:
          peerVotes > 0
            ? `Already has ${peerVotes} peer vote(s)`
            : "No votes yet, good candidate to break ties",
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);

  return {
    electionId: election.id,
    recommendations: ranked,
  };
}

function generateElectionSummary({ election, items, votes }) {
  const voteCountByItemId = {};
  const participants = new Set();

  votes.forEach((vote) => {
    participants.add(vote.userId);
    voteCountByItemId[vote.itemId] = (voteCountByItemId[vote.itemId] || 0) + 1;
  });

  const sortedItems = items
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      votes: voteCountByItemId[item.id] || 0,
    }))
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return a.name.localeCompare(b.name);
    });

  const topItem = sortedItems.length > 0 ? sortedItems[0] : null;
  const summary = topItem
    ? `${election.name} currently leads with ${topItem.name} at ${topItem.votes} vote(s).`
    : `${election.name} has no list items available for summarization.`;

  return {
    summary,
    stats: {
      totalVotes: votes.length,
      participantCount: participants.size,
      itemCount: items.length,
    },
    topItems: sortedItems.slice(0, 3),
  };
}

function createNotificationDigest({ notifications, unreadStatusId }) {
  const byType = {};
  let unread = 0;

  notifications.forEach((notification) => {
    if (notification.statusId === unreadStatusId) unread += 1;

    const typeKey = String(notification.type || "unknown");
    byType[typeKey] = (byType[typeKey] || 0) + 1;
  });

  const recent = notifications
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5)
    .map((notification) => ({
      id: notification.id,
      text: notification.text,
      type: notification.type,
      statusId: notification.statusId,
      updatedAt: notification.updatedAt,
    }));

  return {
    summary: `You have ${unread} unread notification(s) across ${Object.keys(byType).length} type(s).`,
    unread,
    byType,
    recent,
  };
}

function suggestParticipants({ users, friends, votes, limit }) {
  const boundedLimit = boundCount(limit, 1, 20, 5);
  const voterIds = new Set(votes.map((vote) => vote.userId));
  const friendIds = new Set(friends.map((friend) => friend.friendId));

  const candidates = users
    .filter((user) => friendIds.has(user.id) && !voterIds.has(user.id))
    .map((user) => {
      const lastLogin = user.lastLogin ? new Date(user.lastLogin).getTime() : 0;
      const activityScore = lastLogin > 0 ? 2 : 0;

      return {
        userId: user.id,
        alias: user.alias,
        score: activityScore,
        reason:
          lastLogin > 0
            ? "Recent login indicates they are likely active"
            : "Known friend not yet participating",
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.alias.localeCompare(b.alias);
    })
    .slice(0, boundedLimit);

  return {
    suggestions: candidates,
    count: candidates.length,
  };
}

function describeImageFromMetadata(image) {
  const tags = [];
  if (image.contentType) tags.push(image.contentType);
  if (image.categoryId) tags.push(`category:${image.categoryId}`);
  if (image.filename) tags.push(`file:${image.filename}`);

  const title = image.name || "Untitled image";
  const detail = image.description || "No description available";

  return {
    description: `${title}. ${detail}.`,
    tags,
    confidence: 0.72,
  };
}

function inferSmartDefaults(preferences) {
  const defaults = {
    suggestionCount: 5,
    preferredCategory: "General",
    moderationLevel: "medium",
    digestWindowDays: 7,
    assistantStyle: "concise",
  };

  preferences.forEach((preference) => {
    const name = normaliseText(preference.name);
    const value = preference.value;

    if (name.includes("category") && value) defaults.preferredCategory = value;
    if (name.includes("moderation") && value) defaults.moderationLevel = value;
    if (name.includes("digest") && value) {
      defaults.digestWindowDays = boundCount(value, 1, 30, defaults.digestWindowDays);
    }
    if (name.includes("suggest") && value) {
      defaults.suggestionCount = boundCount(value, 1, 10, defaults.suggestionCount);
    }
    if (name.includes("assistant") && value) defaults.assistantStyle = value;
  });

  return {
    defaults,
    sourcePreferenceCount: preferences.length,
  };
}

function answerAssistantQuery({ query, preferences }) {
  const normalized = normaliseText(query);
  if (!normalized) {
    return {
      answer:
        "Ask for list suggestions, text categorization, moderation checks, notification digest, or smart defaults.",
      intent: "help",
    };
  }

  if (normalized.includes("suggest") || normalized.includes("idea")) {
    const suggestionData = generateListSuggestions(query, 5);
    return {
      intent: "suggestions",
      answer: `Inferred category: ${suggestionData.category}.`,
      data: suggestionData,
    };
  }

  if (normalized.includes("categor")) {
    const categoryData = categorizeText(query);
    return {
      intent: "categorize",
      answer: `This text most closely matches ${categoryData.category}.`,
      data: categoryData,
    };
  }

  if (normalized.includes("moderat") || normalized.includes("safe")) {
    const moderationData = moderateText(query);
    return {
      intent: "moderate",
      answer: moderationData.safe
        ? "No unsafe terms were detected."
        : "Unsafe terms were detected.",
      data: moderationData,
    };
  }

  if (normalized.includes("default") || normalized.includes("preference")) {
    const defaults = inferSmartDefaults(preferences || []);
    return {
      intent: "defaults",
      answer: "Generated smart defaults from preferences.",
      data: defaults,
    };
  }

  return {
    intent: "help",
    answer:
      "Supported intents: suggest items, categorize text, moderate text, and preference defaults.",
  };
}

module.exports = {
  recommendElectionItems,
  generateListSuggestions,
  generateElectionSummary,
  createNotificationDigest,
  suggestParticipants,
  categorizeText,
  moderateText,
  describeImageFromMetadata,
  inferSmartDefaults,
  answerAssistantQuery,
};

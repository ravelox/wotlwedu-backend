module.exports.normalizeOptionalId = function normalizeOptionalId(input) {
  if (input === undefined) {
    return { hasField: false, value: null };
  }

  if (input === null) {
    return { hasField: true, value: null };
  }

  if (typeof input === "string") {
    const value = input.trim();
    if (!value || value.toLowerCase() === "undefined") {
      return { hasField: false, value: null };
    }
    if (value.toLowerCase() === "null") {
      return { hasField: true, value: null };
    }
    return { hasField: true, value: value };
  }

  return { hasField: true, value: input };
};

const Category = require("../model/category");

module.exports.resolveOwnedCategoryId = async function (req, categoryId) {
  if (typeof categoryId === "string") {
    const normalized = categoryId.trim();
    if (!normalized || normalized === "undefined") {
      return { ok: true, hasValue: false };
    }
    if (normalized === "null") {
      return { ok: true, hasValue: true, value: null };
    }
    categoryId = normalized;
  }

  if (categoryId === undefined) {
    return { ok: true, hasValue: false };
  }

  if (categoryId === null) {
    return { ok: true, hasValue: true, value: null };
  }

  const foundCategory = await Category.findOne({
    where: {
      id: categoryId,
      creator: req.authUserId,
    },
    attributes: ["id"],
    raw: true,
  });

  if (!foundCategory) {
    return {
      ok: false,
      status: 421,
      message: "Category not found for this user",
    };
  }

  return { ok: true, hasValue: true, value: foundCategory.id };
};

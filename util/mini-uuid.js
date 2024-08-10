const crypto = require("crypto");

// Function to generate (probably non-random) "uuid" with a prefix
module.exports = (prefix) => {
  const randomText = crypto.randomBytes(20).toString("hex") + Date.now();
  const hash = crypto.createHash("md5").update(randomText).digest("hex");
  if (!prefix) prefix = "id";
  return prefix + "_" + hash;
};

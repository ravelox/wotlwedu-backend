const tests = [];

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.WOTLWEDU_DB_DIALECT = process.env.WOTLWEDU_DB_DIALECT || "sqlite";
process.env.WOTLWEDU_DB_STORAGE = process.env.WOTLWEDU_DB_STORAGE || ":memory:";
process.env.WOTLWEDU_DB_LOGGING = process.env.WOTLWEDU_DB_LOGGING || "false";
process.env.WOTLWEDU_JWT_SECRET = process.env.WOTLWEDU_JWT_SECRET || "testsecret";
process.env.WOTLWEDU_DB_SYNC = process.env.WOTLWEDU_DB_SYNC || "true";

function addTest(name, fn) {
  tests.push({ name, fn });
}

// Register test suites
require("./unit-tests")(addTest);
require("./routes.integration.test")(addTest);
require("./live-notification.test")(addTest);

(async () => {
  let failed = false;
for (const t of tests) {
  try {
    await Promise.resolve(t.fn());
    console.log(`PASS ${t.name}`);
  } catch (err) {
    const isSkip =
      typeof err.message === "string" &&
      err.message.toLowerCase().startsWith("integration skipped");
    if (isSkip) {
      console.log(`SKIP ${t.name}: ${err.message}`);
      continue;
    }
    failed = true;
    console.error(`FAIL ${t.name}: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

  if (failed) {
    process.exit(1);
  } else {
    console.log("All tests passed");
  }
})();

const tests = [];

function addTest(name, fn) {
  tests.push({ name, fn });
}

// Register test suites
require("./unit-tests")(addTest);
require("./routes.integration.test")(addTest);

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

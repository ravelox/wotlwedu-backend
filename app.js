// Modules and packages
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const https = require("https");
const FS = require("fs");
const Util = require("util");

const bodyParser = require("body-parser");

const IO = require("./util/wotlwedu-socketio");

// ****
// Needs to be loaded *before* any database operations
// ****
const Config = require("./config/wotlwedu");
const packageJSON = require("./package.json");

// Abort early if JWT secret is missing
if (Config.jwtSecret) {
  console.log("WOTLWEDU_JWT_SECRET is set");
} else {
  console.error("Environment variable WOTLWEDU_JWT_SECRET must be set");
  process.exit(1);
}

console.log(`Starting wotlwedu-backend version ${packageJSON.version}`);

const Housekeeping = require("./util/housekeeping")

const database = require("./util/database");

// Set up database assocations
const Assoc = require("./model/associations");
Assoc.setup();

// Endpoint routes
const loginRoutes = require("./routes/login");
const registerRoutes = require("./routes/register");
const userRoutes = require("./routes/user");
const roleRoutes = require("./routes/role");
const capabilityRoutes = require("./routes/capability");
const itemRoutes = require("./routes/item");
const listRoutes = require("./routes/list");
const groupRoutes = require("./routes/group");
const workgroupRoutes = require("./routes/workgroup");
const imageRoutes = require("./routes/image");
const categoryRoutes = require("./routes/category");
const electionRoutes = require("./routes/election");
const voteRoutes = require("./routes/vote");
const castRoutes = require("./routes/cast");
const preferenceRoutes = require("./routes/preference");
const notificationRoutes = require("./routes/notification");
const helperRoutes = require("./routes/helper");
const organizationRoutes = require("./routes/organization");
const supportRoutes = require("./routes/support");
const publicElectionRoutes = require("./routes/publicelection");
const tutorialRoutes = require("./routes/tutorial");
const adminRoutes = require("./routes/admin");
const homeRoutes = require("./routes/home");

// Helper middleware and functions
const Security = require("./util/security");
const Helpers = require("./util/helpers");
const StatusResponse = require("./util/statusresponse");
const Observability = require("./util/observability");

const app = express();
const API_VERSION = "v1";
const apiPath = (route) => `/${API_VERSION}${route}`;

let privateKey;
let certificate;

if (Config.ssl === true) {
  console.log("SSL Enabled");
  try {
    console.log("Looking for key and certificates");
    privateKey = FS.readFileSync(Config.sslKeyFile);
    certificate = FS.readFileSync(Config.sslCert);
  } catch (err) {
    console.log(err);
    process.exit();
  }
}

app.set("trust proxy", Config.trustProxy);
app.use(Observability.requestContext);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(bodyParser.json({ limit: Config.jsonBodyLimit }));
app.use(
  bodyParser.urlencoded({
    extended: false,
    limit: Config.urlEncodedBodyLimit,
  })
);

// Add CORS headers
app.use(
  cors({
    credentials: Config.corsCredentials,
    origin: function (origin, callback) {
      if (!origin) return callback(null, Config.corsAllowNoOrigin);
      if (!Config.corsOrigin || Config.corsOrigin.includes(origin)) {
        return callback(null, true);
      }
      const err = new Error("CORS origin not allowed");
      err.statusCode = 403;
      return callback(err, false);
    },
  })
);

// Set static directory
app.use(express.static(path.join(__dirname, "public")));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// Stop the favicon request in its tracks
app.get("/favicon.ico", (req, res) => res.status(204));

app.get("/healthz", Helpers.logComment("Health"), (req, res) => {
  res.status(200).json(Observability.healthPayload());
});

app.get("/readyz", Helpers.logComment("Readiness"), async (req, res, next) => {
  try {
    const readiness = await Observability.readinessStatus();
    res.status(readiness.ready ? 200 : 503).json(readiness);
  } catch (err) {
    next(err);
  }
});

app.get("/metrics", Helpers.logComment("Metrics"), (req, res) => {
  if (!Config.metricsEnabled) {
    return res.status(404).type("text/plain").send("metrics disabled\n");
  }
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(Observability.prometheusMetrics());
});

// Routes that can be accessed without a login
app.use(apiPath("/login"), Helpers.logComment("Login"), loginRoutes);
app.use(apiPath("/register"), Helpers.logComment("Register"), registerRoutes);
app.use(apiPath("/public/poll"), Helpers.logComment("Public Poll"), publicElectionRoutes);

/* Connection Test */
app.use(
  apiPath("/ping"),
  Helpers.logComment("Ping"),
  Security.checkAuthentication,
  (req, res, next) => {
    return StatusResponse(res, 200, "OK", {
      version: Helpers.package.version,
      date: new Date(),
    });
  }
);

// Routes that require a login
app.use(
  apiPath("/admin"),
  Helpers.logComment("Admin"),
  Security.checkAuthentication,
  Security.checkSystemAdmin,
  adminRoutes
);
app.use(
  apiPath("/organization"),
  Helpers.logComment("Organization"),
  Security.checkAuthentication,
  organizationRoutes
);
app.use(
  apiPath("/home"),
  Helpers.logComment("Home"),
  Security.checkAuthentication,
  homeRoutes
);
app.use(
  apiPath("/support"),
  Helpers.logComment("Support"),
  Security.checkAuthentication,
  supportRoutes
);
app.use(
  apiPath("/tutorial"),
  Helpers.logComment("Tutorial"),
  Security.checkAuthentication,
  tutorialRoutes
);
app.use(
  apiPath("/helper"),
  Helpers.logComment("Helper"),
  Security.checkAuthentication,
  helperRoutes
);
app.use(
  apiPath("/person"),
  Helpers.logComment("Person"),
  Security.checkAuthentication,
  userRoutes
);
app.use(
  apiPath("/role"),
  Helpers.logComment("Role"),
  Security.checkAuthentication,
  roleRoutes
);
app.use(
  apiPath("/capability"),
  Helpers.logComment("Capability"),
  Security.checkAuthentication,
  capabilityRoutes
);
app.use(
  apiPath("/item"),
  Helpers.logComment("Item"),
  Security.checkAuthentication,
  itemRoutes
);
app.use(
  apiPath("/list"),
  Helpers.logComment("List"),
  Security.checkAuthentication,
  listRoutes
);
app.use(
  apiPath("/space"),
  Helpers.logComment("Space"),
  Security.checkAuthentication,
  workgroupRoutes
);
app.use(
  apiPath("/circle"),
  Helpers.logComment("Circle"),
  Security.checkAuthentication,
  groupRoutes
);
app.use(
  apiPath("/picture"),
  Helpers.logComment("Picture"),
  Security.checkAuthentication,
  imageRoutes
);
app.use(
  apiPath("/category"),
  Helpers.logComment("Category"),
  Security.checkAuthentication,
  categoryRoutes
);
app.use(
  apiPath("/poll"),
  Helpers.logComment("Poll"),
  Security.checkAuthentication,
  electionRoutes
);
app.use(
  apiPath("/vote"),
  Helpers.logComment("Vote"),
  Security.checkAuthentication,
  voteRoutes
);
app.use(
  apiPath("/preference"),
  Helpers.logComment("Preference"),
  Security.checkAuthentication,
  preferenceRoutes
);

app.use(
  apiPath("/cast"),
  Helpers.logComment("Cast"),
  Security.checkAuthentication,
  castRoutes
);

app.use(
  apiPath("/notification"),
  Helpers.logComment("Notification"),
  Security.checkAuthentication,
  notificationRoutes
);

app.use((req, res, next) => {
  Helpers.logComment("No Endpoint"),
    res.status(404).json({ status: 404, message: "No endpoint" });
});

// Catch-all error handler
app.use((error, req, res, next) => {
  const status = error.statusCode || 500;
  let message = error.message;
  let data = error.data;
  let errType = error.type;

  if (error.name === "MulterError") {
    if (error.code === "LIMIT_FILE_SIZE") {
      message = "Uploaded file is too large";
      return res.status(413).json({ status: 413, message });
    }
    message = "Invalid upload";
    return res.status(421).json({ status: 421, message });
  }

  if (error.type === "entity.too.large") {
    return res
      .status(413)
      .json({ status: 413, message: "Request body is too large" });
  }

  if (status >= 500) Observability.reportError(error, req);
  if (Config.isProduction && status >= 500) {
    message = "Internal Server Error";
    data = undefined;
    errType = undefined;
  }
  res
    .status(status)
    .json({ status: status, message: message, type: errType, data: data });
});

module.exports = app;

// Skip starting listeners during automated tests
if (process.env.NODE_ENV === "test") {
  return;
}

function checkDBConnection() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Testing database connection");
      await database.authenticate();
      console.log("Connection has been established successfully.");
      resolve(true);
    } catch (error) {
      console.log("Unable to connect to the database");
      reject(error);
    }
  });
}

// Only start if the connection can be made to the database
checkDBConnection()
  .then((result) => {
    console.log("Listening on " + Config.app_listen + ":" + Config.app_port);
    let server;
    if (Config.ssl === true) {
      server = https.createServer({ key: privateKey, cert: certificate }, app);
      server.listen(Config.app_port, Config.app_listen);
    } else {
      server = app.listen(Config.app_port, Config.app_listen);
    }

    console.log("Starting housekeeping")
    setInterval(()=>{
        Housekeeping.expireElections();
        Housekeeping.cleanRegistrations();
        Housekeeping.cleanResetTokens();
        Housekeeping.cleanFriendshipTokens();
    }, Config.housekeepingInterval * 1000);

    IO.clearRegistrations()
      .catch((err) => {
        console.log("Socket registration cleanup failed; continuing startup");
        console.log(err);
      })
      .then(() => {
        console.log("Done")

        const ioServer = IO.init(server);

        ioServer.on("connection", (socket) => {
          socket.on("register", (data) => {
            if (data && data.id) {
              IO.register(data.id, socket.id);
            }
          });

          socket.once("unregister", () => {
            IO.unregister(socket.id);
          });

          socket.once("disconnect", () => {
            IO.unregister(socket.id);
          });
        });
      });
  })
  .catch((error) => {
    if (error.name === "SequelizeConnectionRefusedError") {
      console.log(
        "Cannot reach host: " + error.parent.address + ":" + error.parent.port
      );
    } else {
      console.log(JSON.stringify(error));
    }
  });

// Modules and packages
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
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

const UUID = require("./util/mini-uuid");
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

// Helper middleware and functions
const Security = require("./util/security");
const Helpers = require("./util/helpers");
const StatusResponse = require("./util/statusresponse");

const app = express();

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

app.use(bodyParser.json());

// Set up multer for PNG and JPEG images

FS.mkdirSync(Config.imageDir, { recursive: true });
const multerFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, Config.imageDir);
  },
  filename: (req, file, cb) => {
    const fileExt = req.body.fileextension ? req.body.fileextension : "jpg";
    cb(
      null,
      (req.params.imageId ? req.params.imageId : UUID("file")) + "." + fileExt
    );
  },
});
const filterMimeTypes = ["image/png", "image/jpg", "image/jpeg"];
const multerFilter = (req, file, cb) => {
  cb(null, filterMimeTypes.includes(file.mimetype));
};

app.post(
  "/image/file/:imageId",
  multer({ storage: multerFileStorage, fileFilter: multerFilter }).single(
    "imageUpload"
  )
);

// Add CORS headers
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (!Config.corsOrigin || Config.corsOrigin.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"), false);
    },
  })
);

// Set static directory
app.use(express.static(path.join(__dirname, "public")));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// Stop the favicon request in its tracks
app.get("/favicon.ico", (req, res) => res.status(204));

// Routes that can be accessed without a login
app.use("/login", Helpers.logComment("Login"), loginRoutes);
app.use("/register", Helpers.logComment("Register"), registerRoutes);
app.use("/public/election", Helpers.logComment("Public Election"), publicElectionRoutes);

/* Connection Test */
app.use(
  "/ping",
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
  "/organization",
  Helpers.logComment("Organization"),
  Security.checkAuthentication,
  organizationRoutes
);
app.use(
  "/support",
  Helpers.logComment("Support"),
  Security.checkAuthentication,
  supportRoutes
);
app.use(
  "/helper",
  Helpers.logComment("Helper"),
  Security.checkAuthentication,
  helperRoutes
);
app.use(
  "/user",
  Helpers.logComment("User"),
  Security.checkAuthentication,
  userRoutes
);
app.use(
  "/role",
  Helpers.logComment("Role"),
  Security.checkAuthentication,
  roleRoutes
);
app.use(
  "/capability",
  Helpers.logComment("Capability"),
  Security.checkAuthentication,
  capabilityRoutes
);
app.use(
  "/item",
  Helpers.logComment("Item"),
  Security.checkAuthentication,
  itemRoutes
);
app.use(
  "/list",
  Helpers.logComment("List"),
  Security.checkAuthentication,
  listRoutes
);
app.use(
  "/workgroup",
  Helpers.logComment("Workgroup"),
  Security.checkAuthentication,
  workgroupRoutes
);
app.use(
  "/group",
  Helpers.logComment("Group"),
  Security.checkAuthentication,
  groupRoutes
);
app.use(
  "/image",
  Helpers.logComment("Image"),
  Security.checkAuthentication,
  imageRoutes
);
app.use(
  "/category",
  Helpers.logComment("Category"),
  Security.checkAuthentication,
  categoryRoutes
);
app.use(
  "/election",
  Helpers.logComment("Election"),
  Security.checkAuthentication,
  electionRoutes
);
app.use(
  "/vote",
  Helpers.logComment("Vote"),
  Security.checkAuthentication,
  voteRoutes
);
app.use(
  "/preference",
  Helpers.logComment("Preference"),
  Security.checkAuthentication,
  preferenceRoutes
);

app.use(
  "/cast",
  Helpers.logComment("Cast"),
  Security.checkAuthentication,
  castRoutes
);

app.use(
  "/notification",
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
  const message = error.message;
  const data = error.data;
  const errType = error.type;
  if (status >= 500) console.log(error);
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

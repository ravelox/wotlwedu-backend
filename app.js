// Modules and packages
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const https = require('https')
const FS = require('fs')

const bodyParser = require("body-parser");

// ****
// Needs to be loaded *before* any database operations
// ****
const Config = require("./config/wotlwedu");

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
const imageRoutes = require("./routes/image");
const categoryRoutes = require("./routes/category");
const electionRoutes = require("./routes/election");
const voteRoutes = require("./routes/vote");
const castRoutes = require("./routes/cast");
const preferenceRoutes = require("./routes/preference");
const notificationRoutes = require("./routes/notification");
const helperRoutes = require("./routes/helper");

// Helper middleware and functions
const Security = require("./util/security");
const Helpers = require("./util/helpers");
const StatusResponse = require("./util/statusresponse");

const app = express();

const privateKey = FS.readFileSync( Config.sslKeyFile);
const certificate = FS.readFileSync( Config.sslCert );

app.use(bodyParser.json());

// Set up multer for PNG and JPEG images
const multerFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images");
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

//Add CORS headers
app.use(
  cors({
    origin: ["http://localhost:4200"],
  })
);

// Set static directory
app.use(express.static(path.join(__dirname, "public")));

// Stop the favicon request in its tracks
app.get("/favicon.ico", (req, res) => res.status(204));

// Routes that can be accessed without a login
app.use("/login", Helpers.logComment("Login"), loginRoutes);
app.use("/register", Helpers.logComment("Register"), registerRoutes);

/* Connection Test */
app.use("/ping", Helpers.logComment("Ping"), Security.checkAuthentication, (req, res, next) => {
  return StatusResponse(res, 200, "OK", { version: "0.0.1", date: new Date() });
});

// Routes that require a login
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
    https.createServer({key: privateKey, cert: certificate},app).listen(Config.app_port, Config.app_listen);
  })
  .catch((error) => {
    if (error.name === "SequelizeConnectionRefusedError") {
      console.log("Cannot reach host: " + error.parent.address + ":" + error.parent.port )
    } else {
      console.log(JSON.stringify(error));
    }
  });

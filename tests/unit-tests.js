const assert = require("assert");
const http = require("http");
const express = require("express");
const FormData = require("form-data");
const FS = require("fs");
const Os = require("os");
const Path = require("path");

const miniUuid = require("../util/mini-uuid");
const statusResponse = require("../util/statusresponse");
const Helpers = require("../util/helpers");
const Security = require("../util/security");
const LoginController = require("../controllers/login");
const AdminController = require("../controllers/admin");
const Mailer = require("../util/mailer");
const Config = require("../config/wotlwedu");
const DBUpdate = require("../util/dbupdate");
const RateLimit = require("../util/rate-limit");
const UploadSecurity = require("../util/upload-security");
const MediaStorage = require("../util/media-storage");

function createMemoryMetadata(initialRows = {}) {
  const rows = new Map(
    Object.entries(initialRows).map(([name, row]) => [
      name,
      {
        name,
        value: row.value,
        comment: row.comment || null,
      },
    ])
  );

  function wrap(row) {
    if (!row) return null;
    return {
      get name() {
        return row.name;
      },
      get value() {
        return row.value;
      },
      set value(nextValue) {
        row.value = nextValue;
      },
      get comment() {
        return row.comment;
      },
      set comment(nextComment) {
        row.comment = nextComment;
      },
      async save() {
        rows.set(row.name, row);
        return this;
      },
    };
  }

  return {
    rows,
    async sync() {},
    async findByPk(name) {
      return wrap(rows.get(name) || null);
    },
    async create(row) {
      const nextRow = { ...row };
      rows.set(nextRow.name, nextRow);
      return wrap(nextRow);
    },
  };
}

function writeUpdateModule(dir, fileName, source) {
  const filePath = Path.join(dir, fileName);
  FS.writeFileSync(filePath, source);
  delete require.cache[require.resolve(filePath)];
}

function postMultipart(server, path, form) {
  return new Promise((resolve, reject) => {
    const addressInfo = server.address();
    const req = http.request(
      {
        method: "POST",
        host: addressInfo.address || "127.0.0.1",
        port: addressInfo.port,
        path,
        headers: form.getHeaders(),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : {},
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            body: data,
          });
        }
        });
      }
    );
    req.on("error", reject);
    form.pipe(req);
  });
}

module.exports = (addTest) => {
  addTest("mini-uuid applies prefix and produces unique values", () => {
    const id = miniUuid("test");
    assert.ok(id.startsWith("test_"), "id should start with prefix");
    const id2 = miniUuid();
    assert.ok(id2.startsWith("id_"), "default prefix should be 'id_'");
    assert.notStrictEqual(id, id2, "subsequent ids should differ");
  });

  addTest("statusResponse formats payload", () => {
    let captured = {};
    const res = {
      status(code) {
        captured.code = code;
        return {
          json(payload) {
            captured.payload = payload;
            return payload;
          },
        };
      },
    };
    const result = statusResponse(res, 201, "Created", { id: 1 });
    assert.strictEqual(captured.code, 201);
    assert.deepStrictEqual(captured.payload, {
      status: 201,
      message: "Created",
      data: { id: 1 },
    });
    assert.deepStrictEqual(result, captured.payload);
  });

  addTest("helpers.copyObject only copies requested keys", () => {
    const source = { a: 1, b: 2, c: 3 };
    const copied = Helpers.copyObject(source, ["a", "c"]);
    assert.deepStrictEqual(copied, { a: 1, c: 3 });
  });

  addTest("helpers.genBase32 returns fixed-length uppercase string", () => {
    const token = Helpers.genBase32();
    assert.strictEqual(token.length, 24);
    assert.ok(/^[A-Z2-7]+$/.test(token), "token should be base32 uppercase");
  });

  addTest("security boolean coercion accepts true/false, 0/1, and string booleans", () => {
    const toBool = Security._toBool;
    assert.strictEqual(toBool(true), true);
    assert.strictEqual(toBool(false), false);
    assert.strictEqual(toBool(1), true);
    assert.strictEqual(toBool(0), false);
    assert.strictEqual(toBool("1"), true);
    assert.strictEqual(toBool("0"), false);
    assert.strictEqual(toBool("true"), true);
    assert.strictEqual(toBool("false"), false);
    assert.strictEqual(toBool(" TRUE "), true);
    assert.strictEqual(toBool(" FALSE "), false);
  });

  addTest("login test-token duration validator enforces integer minute bounds", () => {
    const parse = LoginController._parseTokenDurationMinutes;
    assert.strictEqual(parse(1), 1);
    assert.strictEqual(parse("30"), 30);
    assert.strictEqual(parse(43200), 43200);
    assert.strictEqual(parse(0), null);
    assert.strictEqual(parse(-1), null);
    assert.strictEqual(parse(43201), null);
    assert.strictEqual(parse("abc"), null);
    assert.strictEqual(parse(3.5), null);
  });

  addTest("login display-name splitter derives first and last names safely", () => {
    const split = LoginController._splitDisplayName;
    assert.deepStrictEqual(split("Jane Doe"), {
      firstName: "Jane",
      lastName: "Doe",
    });
    assert.deepStrictEqual(split("Prince"), {
      firstName: "Prince",
      lastName: "User",
    });
    assert.deepStrictEqual(split(""), {
      firstName: "",
      lastName: "",
    });
  });

  addTest("login org-name builder uses initials", () => {
    const build = LoginController._buildProvisionedOrganizationName;
    assert.strictEqual(build("John", "Smith"), "J S's Organization");
  });

  addTest("admin config snapshot redacts sensitive values and serializes functions", () => {
    const redacted = AdminController._redactConfig({
      jwtSecret: "super-secret",
      db_password: "database-secret",
      mailgunApiKey: "mail-api-secret",
      passwordResetLinkBaseUrl: "https://reset.example",
      app_port: 9876,
      corsOrigin: ["http://localhost:5173"],
      mailerProvider: { sendEmail() {} },
    });

    assert.strictEqual(redacted.jwtSecret, "[redacted]");
    assert.strictEqual(redacted.db_password, "[redacted]");
    assert.strictEqual(redacted.mailgunApiKey, "[redacted]");
    assert.strictEqual(redacted.passwordResetLinkBaseUrl, "https://reset.example");
    assert.strictEqual(redacted.app_port, 9876);
    assert.deepStrictEqual(redacted.corsOrigin, ["http://localhost:5173"]);
    assert.strictEqual(redacted.mailerProvider.sendEmail, "[function]");
  });

  addTest("upload security accepts only matching JPEG and PNG magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const script = Buffer.from("<script>alert(1)</script>");

    assert.strictEqual(UploadSecurity.sniffImageType(jpeg), "image/jpeg");
    assert.strictEqual(UploadSecurity.sniffImageType(png), "image/png");
    assert.strictEqual(UploadSecurity.sniffImageType(script), null);
    assert.strictEqual(UploadSecurity.sanitizeFileExtension(".PNG"), "png");
    assert.strictEqual(UploadSecurity.sanitizeFileExtension("gif"), "jpg");
    assert.strictEqual(
      UploadSecurity.sanitizeFileStem("../image_123!"),
      "image_123"
    );
  });

  addTest("media storage creates safe provider object keys and public URLs", () => {
    const previousPrefix = Config.mediaStorageKeyPrefix;
    const previousPublicBaseUrl = Config.mediaStoragePublicBaseUrl;
    try {
      Config.mediaStorageKeyPrefix = "tenant media/pictures";
      Config.mediaStoragePublicBaseUrl = "https://cdn.example.com/media";
      const key = MediaStorage.createObjectKey("../image_123!", "image/png");
      assert.match(key, /^tenantmedia\/pictures\/image_123-[a-f0-9]{16}\.png$/);
      assert.strictEqual(
        MediaStorage.getPublicUrl(key),
        `https://cdn.example.com/media/${key}`
      );
    } finally {
      Config.mediaStorageKeyPrefix = previousPrefix;
      Config.mediaStoragePublicBaseUrl = previousPublicBaseUrl;
    }
  });

  addTest("local media storage writes copies and deletes provider objects", async () => {
    const previousProvider = Config.mediaStorageProvider;
    const previousImageDir = Config.imageDir;
    const uploadDir = FS.mkdtempSync(Path.join(Os.tmpdir(), "wotlwedu-media-"));
    try {
      Config.mediaStorageProvider = "local";
      Config.imageDir = uploadDir;
      MediaStorage.resetProviderForTests();
      const provider = MediaStorage.getProvider();
      await provider.putObject({
        objectKey: "pictures/test-source.jpg",
        body: Buffer.from("source"),
        contentType: "image/jpeg",
      });
      assert.strictEqual(
        FS.readFileSync(Path.join(uploadDir, "pictures", "test-source.jpg"), "utf8"),
        "source"
      );
      await provider.copyObject("pictures/test-source.jpg", "pictures/test-copy.jpg");
      assert.strictEqual(
        FS.readFileSync(Path.join(uploadDir, "pictures", "test-copy.jpg"), "utf8"),
        "source"
      );
      await assert.rejects(
        () => provider.putObject({ objectKey: "../escape.jpg", body: Buffer.from("nope") }),
        /Invalid media object key/
      );
      assert.strictEqual(await provider.deleteObject("pictures/test-source.jpg"), true);
      assert.strictEqual(await provider.deleteObject("pictures/missing.jpg"), false);
    } finally {
      Config.mediaStorageProvider = previousProvider;
      Config.imageDir = previousImageDir;
      MediaStorage.resetProviderForTests();
      FS.rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  addTest("rate limiter memory store blocks after configured maximum", async () => {
    const limiter = RateLimit({
      max: 1,
      windowMs: 60 * 1000,
      keyMode: "ip",
      store: "memory",
      message: "Too many test requests",
    });
    const req = {
      ip: "203.0.113.10",
      headers: {},
      connection: {},
      body: {},
      params: {},
    };
    const captured = {};
    const res = {
      set(name, value) {
        captured[name] = value;
      },
      status(code) {
        captured.status = code;
        return {
          json(payload) {
            captured.payload = payload;
            return payload;
          },
        };
      },
    };
    let nextCount = 0;

    await limiter(req, res, () => {
      nextCount += 1;
    });
    await limiter(req, res, () => {
      nextCount += 1;
    });

    assert.strictEqual(nextCount, 1);
    assert.strictEqual(captured.status, 429);
    assert.strictEqual(captured.payload.message, "Too many test requests");
    assert.ok(captured["Retry-After"]);

    RateLimit._memoryCounters.clear();
  });

  addTest("rate limiter scopes counters per protected flow", async () => {
    const req = {
      ip: "203.0.113.11",
      headers: {},
      connection: {},
      body: { email: "same@example.com" },
      params: {},
    };
    const firstLimiter = RateLimit({
      scope: "test.login",
      max: 1,
      windowMs: 60 * 1000,
      keyMode: "ip+body",
      store: "memory",
    });
    const secondLimiter = RateLimit({
      scope: "test.reset",
      max: 1,
      windowMs: 60 * 1000,
      keyMode: "ip+body",
      store: "memory",
    });
    const res = {
      set() {},
      status(code) {
        return {
          json(payload) {
            return { code, payload };
          },
        };
      },
    };
    let firstNextCount = 0;
    let secondNextCount = 0;

    await firstLimiter(req, res, () => {
      firstNextCount += 1;
    });
    await firstLimiter(req, res, () => {
      firstNextCount += 1;
    });
    await secondLimiter(req, res, () => {
      secondNextCount += 1;
    });

    assert.strictEqual(firstNextCount, 1);
    assert.strictEqual(secondNextCount, 1);
    RateLimit._memoryCounters.clear();
  });

  addTest("unauthenticated picture uploads do not write files", async () => {
    const previousImageDir = Config.imageDir;
    const uploadDir = FS.mkdtempSync(Path.join(Os.tmpdir(), "wotlwedu-upload-"));
    Config.imageDir = uploadDir + Path.sep;

    const app = express();
    app.use("/v1/picture", Security.checkAuthentication, require("../routes/image"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));

    try {
      const form = new FormData();
      form.append("fileextension", "jpg");
      form.append("imageUpload", Buffer.from([0xff, 0xd8, 0xff, 0xdb]), {
        filename: "test.jpg",
        contentType: "image/jpeg",
      });

      const response = await postMultipart(
        server,
        "/v1/picture/file/image_noauth",
        form
      );

      assert.ok(response.status >= 400, "unauthenticated upload should fail");
      assert.deepStrictEqual(FS.readdirSync(uploadDir), []);
    } finally {
      Config.imageDir = previousImageDir;
      await new Promise((resolve) => server.close(resolve));
      FS.rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  addTest("mailer confirmation payload uses configured support email and confirmation link", () => {
    const previousSupportEmail = Config.supportEmail;
    const previousConfirmationBaseUrl = Config.confirmationLinkBaseUrl;
    try {
      Config.supportEmail = "support@test.example";
      Config.confirmationLinkBaseUrl = "https://accounts.example";

      const message = Mailer._buildEmailConfirmMessage(
        "user@example.com",
        "confirm-token"
      );

      assert.strictEqual(message.to, "user@example.com");
      assert.strictEqual(message.subject, "Wotlwedu registration confirmation");
      assert.ok(message.text.includes("https://accounts.example/confirm/confirm-token"));
      assert.ok(message.html.includes("https://accounts.example/confirm/confirm-token"));
      assert.ok(message.text.includes("support@test.example"));
      assert.ok(message.html.includes("support@test.example"));
    } finally {
      Config.supportEmail = previousSupportEmail;
      Config.confirmationLinkBaseUrl = previousConfirmationBaseUrl;
    }
  });

  addTest("mailer reset payload falls back to provided frontend URL when config is unset", () => {
    const previousSupportEmail = Config.supportEmail;
    const previousPasswordResetBaseUrl = Config.passwordResetLinkBaseUrl;
    try {
      Config.supportEmail = "support@test.example";
      Config.passwordResetLinkBaseUrl = "";

      const message = Mailer._buildPasswordResetMessage(
        "user@example.com",
        "user_123",
        "reset-token",
        "https://fallback.example"
      );

      assert.ok(message.text.includes("https://fallback.example/pwdreset/user_123/reset-token"));
      assert.ok(message.html.includes("https://fallback.example/pwdreset/user_123/reset-token"));
      assert.ok(message.text.includes("support@test.example"));
    } finally {
      Config.supportEmail = previousSupportEmail;
      Config.passwordResetLinkBaseUrl = previousPasswordResetBaseUrl;
    }
  });

  addTest("mailer organization invite payload falls back to provided frontend URL and includes expiry", () => {
    const previousSupportEmail = Config.supportEmail;
    const previousInviteBaseUrl = Config.inviteLinkBaseUrl;
    try {
      Config.supportEmail = "support@test.example";
      Config.inviteLinkBaseUrl = "";

      const expiresAt = "2026-04-09T12:34:56.000Z";
      const message = Mailer._buildOrganizationInviteMessage(
        "invitee@example.com",
        "Test Org",
        "orginvite token",
        "https://ui.example",
        expiresAt
      );

      assert.strictEqual(message.to, "invitee@example.com");
      assert.ok(
        message.text.includes(
          "https://ui.example/login?invite=orginvite%20token"
        )
      );
      assert.ok(
        message.html.includes(
          "https://ui.example/login?invite=orginvite%20token"
        )
      );
      assert.ok(message.text.includes("This invitation expires on"));
      assert.ok(message.html.includes("This invitation expires on"));
      assert.ok(message.text.includes("support@test.example"));
    } finally {
      Config.supportEmail = previousSupportEmail;
      Config.inviteLinkBaseUrl = previousInviteBaseUrl;
    }
  });

  addTest("mailer public poll invite payload includes invite token and support email", () => {
    const previousSupportEmail = Config.supportEmail;
    const previousBaseFrontendUrl = Config.baseFrontendUrl;
    try {
      Config.supportEmail = "support@test.example";
      Config.baseFrontendUrl = "https://ui.example";

      const message = Mailer._buildPublicPollInviteMessage(
        "invitee@example.com",
        "Friday Lunch",
        "public token",
        "invite token"
      );

      assert.strictEqual(message.subject, 'Invitation to participate in "Friday Lunch"');
      assert.ok(
        message.text.includes(
          "https://ui.example/public/poll/public%20token?invite=invite%20token"
        )
      );
      assert.ok(
        message.html.includes(
          "https://ui.example/public/poll/public%20token?invite=invite%20token"
        )
      );
      assert.ok(message.text.includes("support@test.example"));
      assert.ok(message.html.includes("support@test.example"));
    } finally {
      Config.supportEmail = previousSupportEmail;
      Config.baseFrontendUrl = previousBaseFrontendUrl;
    }
  });

  addTest("database update runner applies modules missing metadata and reapplies incomplete modules", async () => {
    const updateDir = FS.mkdtempSync(Path.join(Os.tmpdir(), "wotlwedu-updates-"));
    global.__wotlweduDbUpdateTestEvents = [];

    try {
      writeUpdateModule(
        updateDir,
        "update-9000.js",
        `
          module.exports.id = "update-9000";
          module.exports.title = "Missing metadata update";
          module.exports.comment = "Missing metadata update";
          module.exports.init = () => {
            global.__wotlweduDbUpdateTestEvents.push("9000:init");
            return { status: 0 };
          };
          module.exports.apply = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9000:apply");
            return { status: 0 };
          };
          module.exports.cleanup = () => {
            global.__wotlweduDbUpdateTestEvents.push("9000:cleanup");
          };
          module.exports.remove = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9000:remove");
            return { status: 0 };
          };
        `
      );
      writeUpdateModule(
        updateDir,
        "update-9001.js",
        `
          module.exports.id = "update-9001";
          module.exports.title = "Incomplete physical update";
          module.exports.comment = "Incomplete physical update";
          module.exports.isApplied = async () => ({ status: 0, applied: false });
          module.exports.init = () => {
            global.__wotlweduDbUpdateTestEvents.push("9001:init");
            return { status: 0 };
          };
          module.exports.apply = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9001:apply");
            return { status: 0 };
          };
          module.exports.cleanup = () => {
            global.__wotlweduDbUpdateTestEvents.push("9001:cleanup");
          };
          module.exports.remove = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9001:remove");
            return { status: 0 };
          };
        `
      );
      writeUpdateModule(
        updateDir,
        "update-9002.js",
        `
          module.exports.id = "update-9002";
          module.exports.title = "Legacy metadata-only update";
          module.exports.comment = "Legacy metadata-only update";
          module.exports.init = () => {
            global.__wotlweduDbUpdateTestEvents.push("9002:init");
            return { status: 0 };
          };
          module.exports.apply = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9002:apply");
            return { status: 0 };
          };
          module.exports.cleanup = () => {
            global.__wotlweduDbUpdateTestEvents.push("9002:cleanup");
          };
          module.exports.remove = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9002:remove");
            return { status: 0 };
          };
        `
      );
      writeUpdateModule(
        updateDir,
        "update-9003.js",
        `
          module.exports.id = "update-9003";
          module.exports.title = "Physically applied update";
          module.exports.comment = "Physically applied update";
          module.exports.isApplied = async () => ({ status: 0, applied: true });
          module.exports.init = () => {
            global.__wotlweduDbUpdateTestEvents.push("9003:init");
            return { status: 0 };
          };
          module.exports.apply = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9003:apply");
            return { status: 0 };
          };
          module.exports.cleanup = () => {
            global.__wotlweduDbUpdateTestEvents.push("9003:cleanup");
          };
          module.exports.remove = async () => {
            global.__wotlweduDbUpdateTestEvents.push("9003:remove");
            return { status: 0 };
          };
        `
      );

      const metadataModel = createMemoryMetadata({
        "update-9001": { value: "applied", comment: "old title" },
        "update-9002": { value: "applied", comment: "old title" },
      });
      const logs = [];

      await DBUpdate.checkForUpdates({
        updatePath: updateDir,
        metadataModel,
        database: { getQueryInterface: () => ({}) },
        associations: { setup() {} },
        logger: { log: (message) => logs.push(message) },
      });

      assert.deepStrictEqual(global.__wotlweduDbUpdateTestEvents, [
        "9000:init",
        "9000:apply",
        "9000:cleanup",
        "9001:init",
        "9001:apply",
        "9001:cleanup",
      ]);
      assert.strictEqual(metadataModel.rows.get("update-9000").value, "applied");
      assert.strictEqual(metadataModel.rows.get("update-9000").comment, "Missing metadata update");
      assert.strictEqual(metadataModel.rows.get("update-9001").comment, "Incomplete physical update");
      assert.strictEqual(metadataModel.rows.get("update-9002").comment, "old title");
      assert.strictEqual(metadataModel.rows.get("update-9003").value, "applied");
      assert.strictEqual(metadataModel.rows.get("update-9003").comment, "Physically applied update");
      assert.ok(
        logs.some((line) =>
          line.includes(
            "reapplying [update-9001 - Incomplete physical update]"
          )
        ),
        "reapply log should include module id and title"
      );
      assert.ok(
        logs.some((line) =>
          line.includes("Skipping update-9002 - Legacy metadata-only update")
        ),
        "skip log should include module id and title"
      );
      assert.ok(
        logs.some((line) =>
          line.includes(
            "Backfilling metadata for already-applied update [update-9003 - Physically applied update]"
          )
        ),
        "backfill log should include module id and title"
      );
    } finally {
      delete global.__wotlweduDbUpdateTestEvents;
      FS.rmSync(updateDir, { recursive: true, force: true });
    }
  });
};

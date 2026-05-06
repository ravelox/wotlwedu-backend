const assert = require("assert");

const miniUuid = require("../util/mini-uuid");
const statusResponse = require("../util/statusresponse");
const Helpers = require("../util/helpers");
const Security = require("../util/security");
const LoginController = require("../controllers/login");
const Mailer = require("../util/mailer");
const Config = require("../config/wotlwedu");

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
};

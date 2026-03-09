const assert = require("assert");

const miniUuid = require("../util/mini-uuid");
const statusResponse = require("../util/statusresponse");
const Helpers = require("../util/helpers");
const Security = require("../util/security");
const LoginController = require("../controllers/login");

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
};

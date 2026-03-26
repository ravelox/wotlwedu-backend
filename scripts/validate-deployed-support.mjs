const baseUrl = (process.env.WOTLWEDU_VALIDATE_BASE_URL || "").replace(/\/+$/, "");
const token = process.env.WOTLWEDU_VALIDATE_TOKEN || "";
const organizationId = process.env.WOTLWEDU_VALIDATE_ORGANIZATION_ID || "";
const userId = process.env.WOTLWEDU_VALIDATE_USER_ID || "";
const email = process.env.WOTLWEDU_VALIDATE_EMAIL || "";
const password = process.env.WOTLWEDU_VALIDATE_PASSWORD || "";

if (!baseUrl) {
  console.error("Missing WOTLWEDU_VALIDATE_BASE_URL");
  process.exit(1);
}

const headers = { Accept: "application/json" };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function assertOk(label, path, options = {}) {
  const { response, body } = await request(path, options);
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${body?.message || response.statusText}`);
  }
  console.log(`PASS ${label} -> ${response.status}`);
  return body;
}

async function main() {
  let activeToken = token;

  if (!activeToken && email && password) {
    const login = await assertOk("POST /login", "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, auth: password }),
    });
    activeToken = login?.data?.auth || "";
    if (!activeToken) {
      throw new Error("POST /login succeeded but did not return an auth token");
    }
  }

  if (!activeToken) {
    throw new Error(
      "Provide WOTLWEDU_VALIDATE_TOKEN or both WOTLWEDU_VALIDATE_EMAIL and WOTLWEDU_VALIDATE_PASSWORD"
    );
  }

  headers.Authorization = `Bearer ${activeToken}`;

  await assertOk("GET /ping", "/ping");
  await assertOk("GET /support/auth/overview", "/support/auth/overview?days=3");
  await assertOk("GET /support/auth/audit", "/support/auth/audit?page=1&items=10");

  if (organizationId) {
    await assertOk(
      "GET /organization/:organizationId/authaudit",
      `/organization/${encodeURIComponent(organizationId)}/authaudit?page=1&items=10`
    );
  }

  if (userId) {
    await assertOk(
      "GET /user/:userId/signin-method",
      `/user/${encodeURIComponent(userId)}/signin-method`
    );
    await assertOk(
      "GET /user/:userId/authaudit",
      `/user/${encodeURIComponent(userId)}/authaudit?page=1&items=10`
    );
  }

  console.log("Deployed support validation completed.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

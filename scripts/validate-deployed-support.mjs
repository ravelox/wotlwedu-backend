const API_VERSION = "v1";
const configuredBaseUrl = (process.env.WOTLWEDU_VALIDATE_BASE_URL || "").replace(/\/+$/, "");
const baseUrl = /\/v\d+$/.test(configuredBaseUrl)
  ? configuredBaseUrl
  : `${configuredBaseUrl}/${API_VERSION}`;
const token = process.env.WOTLWEDU_VALIDATE_TOKEN || "";
const organizationId = process.env.WOTLWEDU_VALIDATE_ORGANIZATION_ID || "";
const userId = process.env.WOTLWEDU_VALIDATE_USER_ID || "";
const email = process.env.WOTLWEDU_VALIDATE_EMAIL || "";
const password = process.env.WOTLWEDU_VALIDATE_PASSWORD || "";
const outputPath = process.env.WOTLWEDU_VALIDATE_OUTPUT || "";

if (!configuredBaseUrl) {
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
  let resolvedOrganizationId = organizationId;
  let resolvedUserId = userId;
  const report = {
    baseUrl,
    checks: [],
    userId: null,
    organizationId: null,
  };

  async function runCheck(label, path, options = {}) {
    const body = await assertOk(label, path, options);
    report.checks.push({ label, path, ok: true });
    return body;
  }

  if (!activeToken && email && password) {
    const login = await runCheck("POST /login", "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, auth: password }),
    });
    activeToken = login?.data?.authToken || login?.data?.auth || "";
    resolvedOrganizationId = resolvedOrganizationId || login?.data?.organizationId || "";
    resolvedUserId = resolvedUserId || login?.data?.userId || "";
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
  report.userId = resolvedUserId || null;
  report.organizationId = resolvedOrganizationId || null;

  await runCheck("GET /ping", "/ping");
  await runCheck("GET /support/auth/overview", "/support/auth/overview?days=3");
  await runCheck("GET /support/auth/audit", "/support/auth/audit?page=1&items=10");

  if (resolvedOrganizationId) {
    await runCheck(
      "GET /organization/:organizationId/authaudit",
      `/organization/${encodeURIComponent(resolvedOrganizationId)}/authaudit?page=1&items=10`
    );
  }

  if (resolvedUserId) {
    await runCheck(
      "GET /person/:userId/signin-method",
      `/person/${encodeURIComponent(resolvedUserId)}/signin-method`
    );
    await runCheck(
      "GET /person/:userId/authaudit",
      `/person/${encodeURIComponent(resolvedUserId)}/authaudit?page=1&items=10`
    );
  }

  if (outputPath) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`Wrote validation report to ${outputPath}`);
  }

  console.log("Deployed support validation completed.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

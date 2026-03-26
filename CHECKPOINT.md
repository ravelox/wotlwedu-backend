# Checkpoint

Last updated: 2026-03-24
Repo: `wotlwedu-backend`
Current version: `0.0.31`

## Current Focus

This repo contains the backend side of the production auth/invite hardening and support observability work. The current frontend counterpart for operational workflows is now `wotlwedu-admin`, while `wotlwedu-browser` and `wotlwedu-minimal` are archived.

## Implemented State

- Google sign-in with backend token verification and JIT provisioning already exists.
- Invite-aware onboarding, invite lifecycle management, and invite history already exist.
- Deferred Google linking for existing password users already exists.
- Backend hardening already exists for auth/invite audit logging and rate limiting.
- Support/admin surfaces already available:
  - `GET /user/:userId/signin-method`
  - `DELETE /user/:userId/signin-method/:identityId`
  - `GET /user/:userId/authaudit`
  - `GET /organization/:organizationId/authaudit`
- Dedicated support observability endpoints now exist:
  - `GET /support/auth/overview`
  - `GET /support/auth/audit`
- Admin/scoped-admin narrowing now exists for `GET /user?organizationId=...` and `GET /workgroup?organizationId=...`.
- Invite creation now returns structured conflict diagnostics when an invited email already belongs to another organization.
- Auth-audit events can now be emitted as structured stdout logs via `WOTLWEDU_AUTH_AUDIT_STDOUT`.
- Mailer templates support richer deep links and support contact configuration.
- Added top-level [`.env.example`](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/.env.example).
- Added a live validation hook for deployed support/auth surfaces via `npm run validate:deployed-support`, including login-based auto-discovery of user/org scope.
- Current admin-facing consumers include:
  - `wotlwedu-ui` for the primary user web application
  - `wotlwedu-admin` for sysops and support operations

## Key Files For This Baseline

- [config/wotlwedu.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/config/wotlwedu.js)
- [app.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/app.js)
- [controllers/organization.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/controllers/organization.js)
- [controllers/support.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/controllers/support.js)
- [controllers/user.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/controllers/user.js)
- [routes/organization.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/routes/organization.js)
- [routes/support.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/routes/support.js)
- [routes/user.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/routes/user.js)
- [util/mailer.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/util/mailer.js)
- [util/auth-audit.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/util/auth-audit.js)
- [model/associations.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/model/associations.js)
- [tests/routes.integration.test.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/tests/routes.integration.test.js)
- [README.md](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/README.md)
- [docs/openapi.yaml](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/docs/openapi.yaml)
- [CHANGELOG.md](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/CHANGELOG.md)
- [`.env.example`](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/.env.example)

## Verification Already Run

Passed:

```bash
NODE_ENV=test \
WOTLWEDU_DB_DIALECT=sqlite \
WOTLWEDU_DB_STORAGE=:memory: \
WOTLWEDU_DB_LOGGING=false \
WOTLWEDU_JWT_SECRET=testsecret \
WOTLWEDU_DB_SYNC=true \
node tests/run-tests.js
```

## Important Behavior Decisions

- Apple sign-in is intentionally out of scope unless explicitly requested.
- Existing password users are not auto-linked to Google before successful provider auth and explicit post-auth confirmation.
- Existing non-password social account conflicts should not silently auto-link.

## Likely Next Actions

1. Run `npm run validate:deployed-support` against the real deployed MariaDB-backed environment with live org/user IDs, not only sqlite integration mode.
2. Decide whether to wire the structured auth-audit logs into an external metrics/alerting stack.
3. Add backend endpoints for richer remediation and infrastructure operations as `wotlwedu-admin` expands.

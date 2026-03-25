# Checkpoint

Last updated: 2026-03-24
Repo: `wotlwedu-backend`
Current version: `0.0.26`

## Current Focus

This repo contains the backend side of the production auth/invite hardening work. The recent slice added support-oriented auth visibility, organization audit feeds, richer invite diagnostics, and deployment config examples.

## Implemented State

- Google sign-in with backend token verification and JIT provisioning already exists.
- Invite-aware onboarding, invite lifecycle management, and invite history already exist.
- Deferred Google linking for existing password users already exists.
- Backend hardening already exists for auth/invite audit logging and rate limiting.
- New support/admin surfaces added in this checkpoint:
  - `GET /user/:userId/signin-method`
  - `DELETE /user/:userId/signin-method/:identityId`
  - `GET /user/:userId/authaudit`
  - `GET /organization/:organizationId/authaudit`
- Invite creation now returns structured conflict diagnostics when an invited email already belongs to another organization.
- Mailer templates now support richer deep links and support contact configuration.
- Added top-level [`.env.example`](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/.env.example).

## Main Files Changed In This Uncommitted Slice

- [config/wotlwedu.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/config/wotlwedu.js)
- [controllers/organization.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/controllers/organization.js)
- [controllers/user.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/controllers/user.js)
- [routes/organization.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/routes/organization.js)
- [routes/user.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/routes/user.js)
- [util/mailer.js](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/util/mailer.js)
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

1. Stage, commit, tag, and push this uncommitted slice if accepted.
2. Consider whether to add more unlinking tests and support tooling on top of the new audit endpoints.
3. Run the same flows against the real deployed DB, not only sqlite integration mode.

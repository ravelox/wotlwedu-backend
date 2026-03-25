# wotlwedu-backend

## What is wotlwedu?
*wotlwedu* (What'll We Do?) helps groups decide by voting on curated lists (food, places, activities, media, etc.). In the platform, these polls are called **elections**.

## What is this repository?
This repository contains the REST API backend for the wotlwedu ecosystem. It is used by clients such as:
- `wotlwedu-minimal`
- `wotlwedu-browser`
- `wotlwedu-ios`

Core stack:
- Node.js + Express
- JWT authentication + role/capability authorization
- Sequelize by default (MariaDB)
- Optional DB adapters via `WOTLWEDU_DB_TYPE` (`sequelize`, `mongoose`, `pg`)
- Socket.IO for real-time notifications/refresh events
- Organization/workgroup tenancy controls

## Multi-tenancy concepts
- `Organization`: top-level tenant boundary. Data access is restricted by organization context.
- `Workgroup`: sub-unit inside an organization (dedicated entity/table; separate from election audience groups).
- `User`: belongs to exactly one organization (`organizationId`).
- `System admin user`: global administrator that can administer any organization and any workgroup.
- `Organization admin user`: can administer workgroups and users across workgroups in their organization.
- `Workgroup admin user`: can administer data for one workgroup (`adminWorkgroupId`, legacy `adminGroupId`).

## Current version
The backend changes in this repo are documented as **0.0.24** in `CHANGELOG.md`.

## Recent API behavior updates
- Category IDs are now consistently included on category-enabled resources (`group`, `workgroup`, `image`, `item`, `list`, `election`).
- Category assignment is user-scoped: a resource can only be assigned a category created by the authenticated user.
- Category-enabled list endpoints support optional grouped payloads via `?collapsible=true`.
- Workgroup/organization ID inputs now normalize common frontend placeholders (`""`, `"undefined"`, `"null"`) to reduce false `421` responses.
- Organization route access is now guarded by capability middleware at the router level.
- Notification listing is paged and sorted newest-first (`GET /notification?page=&items=`).
- Notification unread counts now use a direct count query (`GET /notification/unreadcount`).
- Socket.IO notification events now carry structured payloads so clients can update local inbox/badge state without full refetches.
- Add `POST /login/google` for verified Google ID-token sign-in.
- Add `POST /login/social` for JIT social sign-in provisioning using provider identity + email.
- Add post-auth social-link confirmation via `POST /login/google/link` and `POST /login/social/link` when a verified Google/social sign-in matches an existing password-based account.
- Add organization email invitations via `POST /organization/:organizationId/invite`.
- Add public invite lookup via `GET /login/invite/:token` so clients can show invite context before Google sign-in.
- First-time social sign-in now consumes a pending organization invite only when the supplied invite token matches the Google account email; otherwise it auto-provisions a new organization named `<FirstInitial> <LastInitial>'s Organization`.
- Matching password-based accounts are not auto-linked before provider authentication. Social login now returns a neutral `linkRequired` confirmation state after verified provider authentication, and linking preserves password login.
- Social sign-in now refuses to auto-link against an existing non-password account match and returns a manual-support error instead of risking account takeover or duplicate identity state.
- Auth and invite operations now emit persistent audit records (`authaudits`) covering password sign-in, social sign-in, deferred link confirmation, invite lookup, invite acceptance, invite creation, resend, and revoke flows.
- Support/admin observability now includes aggregated support endpoints via `GET /support/auth/overview` and `GET /support/auth/audit`.
- Invite lookup, invite management, and deferred social-link confirmation now use dedicated rate limits in addition to the existing password/social login throttles.
- Add user-level support endpoints for linked sign-in methods and recent auth audit history via `GET /user/:userId/signin-method`, `DELETE /user/:userId/signin-method/:identityId`, and `GET /user/:userId/authaudit`.
- Add organization-level audit visibility for admins via `GET /organization/:organizationId/authaudit`.
- Organization invite conflicts now return structured diagnostics when the target email already belongs to another organization.
- Add invite lifecycle controls for org admins: `GET /organization/:organizationId/invite`, `POST /organization/:organizationId/invite/:inviteId/resend`, and `DELETE /organization/:organizationId/invite/:inviteId`.
- Organization invites now default to a 7-day expiry (`WOTLWEDU_ORG_INVITE_EXPIRY_DAYS`) and retain status history (`pending`, `accepted`, `revoked`, `expired`) for admin review.

## Prerequisites
- Node.js and npm
- A reachable database server (MariaDB for default Sequelize configuration)
- Required environment variable: `WOTLWEDU_JWT_SECRET`

Without `WOTLWEDU_JWT_SECRET`, the app exits at startup.

## Quick start (local)
1. Clone and enter the repo:
   ```bash
   git clone https://github.com/ravelox/wotlwedu-backend.git
   cd wotlwedu-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables (minimum example):
   ```bash
   export WOTLWEDU_JWT_SECRET="change-me"
   export WOTLWEDU_DB_HOST="localhost"
   export WOTLWEDU_DB_USER="wotlwedu"
   export WOTLWEDU_DB_NAME="wotlwedu"
   export WOTLWEDU_DB_PASSWORD="wotlwedu"
   ```
   For the full auth/invite/deep-link configuration, start from [`.env.example`](/Users/dkelly/Projects/wotlwedu/wotlwedu-backend/.env.example).
4. Start the API:
   ```bash
   npm start
   ```

Dev mode:
```bash
npm run dev
```

Tests:
```bash
npm test
```

Live notification test (push one real notification through the running API so an active UI session can receive it):
```bash
export WOTLWEDU_LIVE_API="http://localhost:9876"
export WOTLWEDU_LIVE_TOKEN="REPLACE_WITH_BEARER_TOKEN"
export WOTLWEDU_LIVE_NOTIFICATION_USER_ID="user_123"
export WOTLWEDU_LIVE_NOTIFICATION_SENDER_ID="user_123"   # optional; defaults to recipient
export WOTLWEDU_LIVE_NOTIFICATION_STATUS_ID="100"        # optional; default Unread
export WOTLWEDU_LIVE_NOTIFICATION_TYPE="109"             # optional
export WOTLWEDU_LIVE_NOTIFICATION_TEXT="Live test ping"  # optional
npm run test:live-notification
```

## Environment configuration
Runtime options are defined in `config/wotlwedu.js` and can be overridden with environment variables.

Commonly used settings:
- App listener: `WOTLWEDU_APP_LISTEN`, `WOTLWEDU_APP_PORT`
- DB: `WOTLWEDU_DB_HOST`, `WOTLWEDU_DB_USER`, `WOTLWEDU_DB_NAME`, `WOTLWEDU_DB_PASSWORD`, `WOTLWEDU_DB_TYPE`
- Auth: `WOTLWEDU_JWT_SECRET`, `WOTLWEDU_GOOGLE_CLIENT_ID`
- Support/deep links: `WOTLWEDU_SUPPORT_EMAIL`, `WOTLWEDU_INVITE_LINK_BASE_URL`, `WOTLWEDU_PASSWORD_RESET_LINK_BASE_URL`, `WOTLWEDU_CONFIRMATION_LINK_BASE_URL`
- Invite policy: `WOTLWEDU_ORG_INVITE_EXPIRY_DAYS`
- TLS: `WOTLWEDU_SSL`, `WOTLWEDU_SSL_KEY`, `WOTLWEDU_SSL_CERT`
- CORS: `WOTLWEDU_CORS_ORIGINS` (comma-separated allowed origins)
- Auth rate limits: `WOTLWEDU_RATE_LOGIN_MAX`, `WOTLWEDU_RATE_RESET_MAX`, `WOTLWEDU_RATE_VERIFY2FA_MAX`, `WOTLWEDU_RATE_SOCIAL_LINK_MAX`, `WOTLWEDU_RATE_INVITE_LOOKUP_MAX`, `WOTLWEDU_RATE_INVITE_MANAGE_MAX`, `WOTLWEDU_RATE_WINDOW_MS`
- Observability: `WOTLWEDU_AUTH_AUDIT_STDOUT`
- URLs: `WOTLWEDU_API_URL`, `WOTLWEDU_FRONTEND_URL`, `WOTLWEDU_IMAGE_URL`
- Images: `WOTLWEDU_IMAGE_DIR`

Notes:
- `WOTLWEDU_DB_TYPE` defaults to `sequelize`.
- If SSL is enabled, provide certificate/key file paths.

## Docker
A `Dockerfile` and `docker-compose.yaml` are provided.

Build image:
```bash
docker build --no-cache -t ravelox/wotlwedu-backend .
```

Run with compose:
```bash
docker compose -f docker-compose.yaml up -d
```

Local compose defaults run the API over HTTP (`WOTLWEDU_SSL=false`) and include localhost CORS origins for UI/browser development.

The compose stack includes:
- `wotlwedudb` (MariaDB)
- `wotlwedu-backend` (API)
- Startup entrypoint always runs baseline DB creation (`model/util-createdb`) before incremental updates (`model/util-updatedb`).

## Helm
A Helm chart is available under `k8s/`.

Notes:
- The backend chart now includes optional ingress support.
- Helm values default to HTTP-friendly local settings (`env.sslEnabled=false`, `env.apiUrl=http://localhost:9876/`).
- Set `environment` and `environments.<name>.service` / `environments.<name>.ingress` in Helm values to apply optional per-environment service and ingress overrides.

## API docs
Swagger UI assets are in `docs/` and served by the app at `/docs`.

- OpenAPI spec: `docs/openapi.yaml`
- Swagger UI launcher: `docs/index.html`
- Current route modules are mounted in `app.js`; there is currently no `/ai` route mounted.

Additional tenancy endpoints:
- `GET /organization`
- `GET /organization/:organizationId`
- `GET /organization/:organizationId/invite`
- `GET /organization/:organizationId/authaudit`
- `POST /organization`
- `POST /organization/:organizationId/invite`
- `POST /organization/:organizationId/invite/:inviteId/resend`
- `DELETE /organization/:organizationId/invite/:inviteId`
- `PUT /organization/:organizationId`
- `DELETE /organization/:organizationId`
- `GET /support/auth/overview`
- `GET /support/auth/audit`

## Notes for contributors
- Response format helper: `util/statusresponse.js`
- Auth middleware and capability checks: `util/security.js`
- Housekeeping jobs run periodically from `app.js`
- Codebase overview: `docs/codebase_overview.md`

## Database update contract (update authors)
The database update runner is `util/dbupdate.js` (invoked by `model/util-updatedb.js`).

How updates are discovered:
- Update modules live in `updates/` and must match `update-\\d+.js`.
- Each module must export an `id` (for example `update-0009`).

How updates are applied:
- Applied-state is tracked in the `metadata` table by update id: a row with `name = <update id>` and `value = "applied"`.
- If the metadata row exists and the module's `isApplied()` reports the change is physically present, the update is skipped.
- If metadata exists but `isApplied()` reports "not applied", the runner re-applies the update (updates are expected to be idempotent).
- If `isApplied()` reports "applied" but metadata is missing, the runner backfills the metadata row.

Notes:
- Many update modules also export `targetDatabaseVersion`, but the current runner does not gate execution on `metadata.name = database.version` or update that value. `database.version` is currently written only by the database creation script (`model/util-createdb.js`) and should be treated as informational unless/until the updater is changed to enforce it.
- Update execution forces the Sequelize adapter (`WOTLWEDU_FORCE_SEQUELIZE_FOR_UPDATES=true`) so migrations are independent of the runtime `WOTLWEDU_DB_TYPE` selection.

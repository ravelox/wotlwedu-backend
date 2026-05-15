# wotlwedu-backend

## What is wotlwedu?
*wotlwedu* (What'll We Do?) helps groups decide by voting on curated lists (food, places, activities, media, etc.). The product language refers to these as **polls**, even where the current API still uses `election` resource names.

## What is this repository?
This repository contains the REST API backend for the wotlwedu ecosystem. It is used by clients such as:
- `wotlwedu-ui`
- `wotlwedu-browser`

Core stack:
- Node.js + Express
- JWT authentication + role/capability authorization
- Sequelize by default (MariaDB)
- Optional DB adapters via `WOTLWEDU_DB_TYPE` (`sequelize`, `mongoose`, `pg`)
- Socket.IO for real-time notifications/refresh events
- Organization/space tenancy controls

## Multi-tenancy concepts
- `Organization`: top-level tenant boundary. Data access is restricted by organization context.
- `Workgroup`: sub-unit inside an organization (dedicated entity/table; separate from election audience groups).
- `User`: belongs to exactly one organization (`organizationId`).
- `System admin user`: global administrator that can administer any organization and any workgroup.
- `Organization admin user`: can administer workgroups and users across workgroups in their organization.
- `Workgroup admin user`: can administer data for one workgroup (`adminWorkgroupId`, legacy `adminGroupId`).

## Current version
The backend changes in this repo are documented as **0.0.56** in `CHANGELOG.md`.

## Seeded Accounts
Database initialization runs `model/util-createdb.js` followed by
`model/util-updatedb.js`. The update path keeps these baseline accounts present
and idempotent:

- `root@localhost.localdomain`: protected system-admin bootstrap account.
- `user@localhost.localdomain`: non-admin default user seeded as
  `user_default` in `org_default`. The default password is
  `default user password`.

The non-admin default user is active, verified, belongs to the default
organization, and has all admin flags disabled.

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
- Add public election access via `GET /public/poll/:token`, guest session issuance via `POST /public/poll/:token/session`, guest voting via `POST /public/poll/:token/vote`, and public abuse reporting via `POST /public/poll/:token/report`.
- Add trust-gated public election invite management for authenticated election owners via `GET /poll/public/trust`, `POST /poll/:electionId/public/enable`, `POST /poll/:electionId/public/disable`, `GET /poll/:electionId/public/stats`, and `GET/POST/DELETE` invite lifecycle routes under `/poll/:electionId/invite`.
- Public poll responses include guest-voting availability, expiry/reporting context, and share URLs; guest sessions expire after `WOTLWEDU_PUBLIC_GUEST_SESSION_TTL_HOURS` and guest votes enforce poll/IP quotas.
- Support users can moderate reported public polls with `POST /support/publicpoll/:electionId/moderation` using `lock`, `restore`, or `remove_public_access`, and can suppress invite recipients with `POST /support/publicpoll/suppression`.
- Add public-poll trust, suppression, invite, participant, vote, and abuse-audit persistence so public links can expand participation without allowing guest-triggered outbound messaging.
- First-time social sign-in now consumes a pending organization invite only when the supplied invite token matches the Google account email; otherwise it auto-provisions a new organization named `<FirstInitial> <LastInitial>'s Organization`.
- Matching password-based accounts are not auto-linked before provider authentication. Social login now returns a neutral `linkRequired` confirmation state after verified provider authentication, and linking preserves password login.
- Social sign-in now refuses to auto-link against an existing non-password account match and returns a manual-support error instead of risking account takeover or duplicate identity state.
- Auth and invite operations now emit persistent audit records (`authaudits`) covering password sign-in, social sign-in, deferred link confirmation, invite lookup, invite acceptance, invite creation, resend, and revoke flows.
- Support/admin observability now includes aggregated support endpoints via `GET /support/auth/overview`, `GET /support/auth/audit`, `GET /support/publicpoll/overview`, `GET /support/publicpoll/audit`, and `GET /support/ops/overview`.
- Poll participation follow-up now includes `POST /poll/:electionId/remind`, and `GET /poll/:electionId/participation` now returns reminder counts and last-reminder metadata.
- Add a real poll tutorial via `POST /tutorial/poll/start` and `GET /tutorial/poll`, which stores tutorial progress per user, suggests exact names for the real list/audience/poll to create in the existing UI, and tracks completion from real items, memberships, votes, and stats.
- Invite lookup, invite management, and deferred social-link confirmation now use dedicated rate limits in addition to the existing password/social login throttles.
- Add user-level support endpoints for linked sign-in methods and recent auth audit history via `GET /person/:userId/signin-method`, `DELETE /person/:userId/signin-method/:identityId`, and `GET /person/:userId/authaudit`.
- Add ownership-transfer preview/apply endpoints for support operators via `GET /person/:userId/ownership/preview` and `POST /person/:userId/ownership/transfer`.
- Add organization-level audit visibility for admins via `GET /organization/:organizationId/authaudit`.
- Organization invite conflicts now return structured diagnostics when the target email already belongs to another organization.
- Add invite lifecycle controls for org admins: `GET /organization/:organizationId/invite`, `POST /organization/:organizationId/invite/:inviteId/resend`, and `DELETE /organization/:organizationId/invite/:inviteId`.
- Organization invites now default to a 7-day expiry (`WOTLWEDU_ORG_INVITE_EXPIRY_DAYS`) and retain status history (`pending`, `accepted`, `revoked`, `expired`) for admin review.
- Admin/scoped-admin collection queries can now narrow `GET /person` and `GET /space` with explicit `organizationId` filters.
- Operator-only aliases now live under `/support/...` for admin/support clients. Preferred paths include `/support/people/:userId/*`, `/support/organizations/:organizationId/*`, `/support/polls/:electionId/*`, and `/support/session/testtoken`.
- Add `GET /admin/config` for authenticated system-admin configuration visibility.
- Add local SMTP defaults for development mail capture.
- Add `POST /tutorial/poll/dismiss` for dismissing the current tutorial prompt without permanently skipping the tutorial.
- Improve database update logging and add coverage for unapplied updates whose metadata row already exists.
- Production security defaults now include Helmet headers, configured JSON/form body limits, production-safe 500 error redaction, stricter production CORS behavior, authenticated picture uploads with file validation, and shared database-backed rate limiting when `NODE_ENV=production`.
- Server-side auth sessions now rotate refresh tokens, detect refresh-token replay, expose current-user session list/revoke endpoints, and provide support session revocation endpoints.
- Self-service registration now provisions a private organization, creates the first personal space, assigns the user to that space, and starts the poll tutorial. New consumer users no longer land in a shared default organization.
- Database initialization now seeds `user@localhost.localdomain` (`user_default`) as a non-admin member of `org_default` with the three-word password `default user password`.

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
   For the full auth/invite/deep-link configuration, start from `.env.example`.
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

Deployed support/auth validation:
```bash
export WOTLWEDU_VALIDATE_BASE_URL="https://api.example.com"
export WOTLWEDU_VALIDATE_TOKEN="REPLACE_WITH_BEARER_TOKEN"
export WOTLWEDU_VALIDATE_ORGANIZATION_ID="org_123"   # optional
export WOTLWEDU_VALIDATE_USER_ID="user_123"          # optional
npm run validate:deployed-support
```

You can also let the script authenticate and auto-discover scope:
```bash
export WOTLWEDU_VALIDATE_BASE_URL="https://api.example.com"
export WOTLWEDU_VALIDATE_EMAIL="admin@example.com"
export WOTLWEDU_VALIDATE_PASSWORD="REPLACE_WITH_PASSWORD"
export WOTLWEDU_VALIDATE_OUTPUT="./support-validation.json"   # optional
npm run validate:deployed-support
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
- Auth: `WOTLWEDU_JWT_SECRET`, `WOTLWEDU_GOOGLE_CLIENT_ID`, `WOTLWEDU_JWT_REFRESH_COOKIE_ENABLED`, `WOTLWEDU_JWT_REFRESH_COOKIE_NAME`, `WOTLWEDU_JWT_REFRESH_COOKIE_SAMESITE`, `WOTLWEDU_JWT_REFRESH_COOKIE_SECURE`
- Support/deep links: `WOTLWEDU_SUPPORT_EMAIL`, `WOTLWEDU_INVITE_LINK_BASE_URL`, `WOTLWEDU_PASSWORD_RESET_LINK_BASE_URL`, `WOTLWEDU_CONFIRMATION_LINK_BASE_URL`
- Invite policy: `WOTLWEDU_ORG_INVITE_EXPIRY_DAYS`
- TLS: `WOTLWEDU_SSL`, `WOTLWEDU_SSL_KEY`, `WOTLWEDU_SSL_CERT`
- Security: `NODE_ENV`, `WOTLWEDU_TRUST_PROXY`, `WOTLWEDU_JSON_BODY_LIMIT`, `WOTLWEDU_URLENCODED_BODY_LIMIT`
- CORS: `WOTLWEDU_CORS_ORIGINS` (comma-separated allowed origins), `WOTLWEDU_CORS_ALLOW_NO_ORIGIN`, `WOTLWEDU_CORS_CREDENTIALS`
- Auth rate limits: `WOTLWEDU_RATE_LIMIT_STORE`, `WOTLWEDU_RATE_LIMIT_FAIL_OPEN`, `WOTLWEDU_RATE_LOGIN_MAX`, `WOTLWEDU_RATE_REGISTER_MAX`, `WOTLWEDU_RATE_RESET_MAX`, `WOTLWEDU_RATE_VERIFY2FA_MAX`, `WOTLWEDU_RATE_SOCIAL_LINK_MAX`, `WOTLWEDU_RATE_INVITE_LOOKUP_MAX`, `WOTLWEDU_RATE_INVITE_MANAGE_MAX`, `WOTLWEDU_RATE_WINDOW_MS`
- Public poll trust/rate limits: `WOTLWEDU_RATE_PUBLIC_POLL_MAX`, `WOTLWEDU_RATE_PUBLIC_VOTE_MAX`, `WOTLWEDU_PUBLIC_TRUST_MIN_ACCOUNT_AGE_HOURS`, `WOTLWEDU_PUBLIC_BASIC_INVITE_QUOTA_DAILY`, `WOTLWEDU_PUBLIC_BASIC_INVITE_QUOTA_HOURLY`, `WOTLWEDU_PUBLIC_BASIC_RECIPIENTS_PER_POLL`, `WOTLWEDU_PUBLIC_INVITE_RESEND_COOLDOWN_HOURS`
- Observability: `WOTLWEDU_AUTH_AUDIT_STDOUT`
- URLs: `WOTLWEDU_API_URL`, `WOTLWEDU_FRONTEND_URL`, `WOTLWEDU_IMAGE_URL`
- Images/media: `WOTLWEDU_IMAGE_DIR`, `WOTLWEDU_UPLOAD_MAX_BYTES`, `WOTLWEDU_MEDIA_STORAGE_PROVIDER`, `WOTLWEDU_MEDIA_PUBLIC_BASE_URL`, `WOTLWEDU_MEDIA_KEY_PREFIX`
- S3-compatible media: `WOTLWEDU_S3_ENDPOINT`, `WOTLWEDU_S3_REGION`, `WOTLWEDU_S3_BUCKET`, `WOTLWEDU_S3_ACCESS_KEY_ID`, `WOTLWEDU_S3_SECRET_ACCESS_KEY`, `WOTLWEDU_S3_FORCE_PATH_STYLE`, `WOTLWEDU_S3_TLS`

Notes:
- `WOTLWEDU_DB_TYPE` defaults to `sequelize`.
- `WOTLWEDU_RATE_LIMIT_STORE` defaults to `database` in production and `memory` elsewhere. Use `database` for horizontally scaled app replicas. Rate-limit counters are scoped per protected flow so login, registration, password reset, social-link, invite, and public-poll throttles do not share accidental counters.
- `WOTLWEDU_MEDIA_STORAGE_PROVIDER` defaults to `local` for development/test. Use `s3` or `s3-compatible` in production with an AWS S3, MinIO, or compatible bucket and set `WOTLWEDU_MEDIA_PUBLIC_BASE_URL` to the public bucket/CDN URL. Media records store provider object keys, so app replicas do not need shared local disk.
- Back up media by snapshotting or replicating the configured object-storage bucket/prefix together with MariaDB backups. Restore both the database and media prefix from the same point in time so image metadata and object keys stay aligned.
- `WOTLWEDU_JWT_REFRESH_COOKIE_ENABLED=true` stores refresh tokens in an HTTP-only cookie while preserving the JSON refresh-token response for existing bearer-token clients. Enable CORS credentials and matching frontend `withCredentials` when using this across origins.
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
- `GET /admin/config`
- `GET /ping`
- `GET /organization`
- `GET /organization/:organizationId`
- `GET /organization/:organizationId/invite`
- `GET /organization/:organizationId/membership`
- `GET /organization/:organizationId/authaudit`
- `POST /organization`
- `POST /organization/:organizationId/invite`
- `POST /organization/:organizationId/invite/:inviteId/resend`
- `DELETE /organization/:organizationId/invite/:inviteId`
- `PUT /organization/:organizationId`
- `DELETE /organization/:organizationId`
- `GET /support/auth/overview`
- `GET /support/auth/audit`
- `GET /tutorial/poll`
- `POST /tutorial/poll/start`
- `POST /tutorial/poll/skip`
- `POST /tutorial/poll/dismiss`
- `POST /tutorial/poll/enable`
- `GET /space`
- `GET /space/:workgroupId`
- `POST /space`
- `PUT /space/:workgroupId`
- `DELETE /space/:workgroupId`
- `PUT /space/:workgroupId/person/:userId`
- `DELETE /space/:workgroupId/person/:userId`
- `PUT /space/:workgroupId/bulkpersonadd`
- `PUT /space/:workgroupId/bulkpersondel`
- `GET /support/people/:userId/signin-method`
- `GET /support/people/:userId/authaudit`
- `GET /support/people/:userId/session`
- `DELETE /support/people/:userId/session/:sessionId`
- `POST /support/people/:userId/session/revoke-all`
- `GET /support/people/:userId/ownership/preview`
- `POST /support/people/:userId/ownership/transfer`
- `POST /support/people/:userId/tutorial/poll/enable`
- `GET /support/organizations/:organizationId/invite`
- `GET /support/organizations/:organizationId/authaudit`
- `POST /support/organizations/:organizationId/invite`
- `POST /support/organizations/:organizationId/invite/:inviteId/resend`
- `DELETE /support/organizations/:organizationId/invite/:inviteId`
- `GET /support/polls/public/trust`
- `POST /poll/:electionId/remind`
- `GET /poll/public/trust`
- `GET /poll/:electionId/public/stats`
- `GET /poll/:electionId/invite`
- `POST /poll/:electionId/public/enable`
- `POST /poll/:electionId/public/disable`
- `POST /poll/:electionId/invite`
- `POST /poll/:electionId/invite/:inviteId/resend`
- `DELETE /poll/:electionId/invite/:inviteId`
- `GET /support/polls/:electionId/public/stats`
- `GET /support/polls/:electionId/invite`
- `POST /support/polls/:electionId/public/enable`
- `POST /support/polls/:electionId/public/disable`
- `POST /support/polls/:electionId/invite`
- `POST /support/polls/:electionId/invite/:inviteId/resend`
- `DELETE /support/polls/:electionId/invite/:inviteId`
- `POST /support/session/testtoken`
- `POST /support/session/testtoken/revoke`
- `GET /login/session`
- `DELETE /login/session/:sessionId`
- `POST /login/logout`
- `POST /login/logout/all`
- `GET /support/publicpoll/overview`
- `GET /support/publicpoll/audit`
- `POST /support/publicpoll/:electionId/moderation`
- `POST /support/publicpoll/suppression`
- `GET /support/ops/overview`
- `GET /person/:userId/ownership/preview`
- `POST /person/:userId/ownership/transfer`
- `GET /public/poll/:token`
- `POST /public/poll/:token/session`
- `POST /public/poll/:token/vote`
- `POST /public/poll/:token/report`

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

# wotlwedu-backend

## What is wotlwedu?
*wotlwedu* (What'll We Do?) helps groups decide by voting on curated lists (food, places, activities, media, etc.). In the platform, these polls are called **elections**.

## What is this repository?
This repository contains the REST API backend for the wotlwedu ecosystem. It is used by clients such as:
- `wotlwedu-minimal`
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
The backend currently ships as version **0.0.13** (see `package.json` and `CHANGELOG.md`).

## Recent API behavior updates
- Category IDs are now consistently included on category-enabled resources (`group`, `workgroup`, `image`, `item`, `list`, `election`).
- Category assignment is user-scoped: a resource can only be assigned a category created by the authenticated user.
- Category-enabled list endpoints support optional grouped payloads via `?collapsible=true`.
- Workgroup/organization ID inputs now normalize common frontend placeholders (`""`, `"undefined"`, `"null"`) to reduce false `421` responses.

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

## Environment configuration
Runtime options are defined in `config/wotlwedu.js` and can be overridden with environment variables.

Commonly used settings:
- App listener: `WOTLWEDU_APP_LISTEN`, `WOTLWEDU_APP_PORT`
- DB: `WOTLWEDU_DB_HOST`, `WOTLWEDU_DB_USER`, `WOTLWEDU_DB_NAME`, `WOTLWEDU_DB_PASSWORD`, `WOTLWEDU_DB_TYPE`
- Auth: `WOTLWEDU_JWT_SECRET`
- TLS: `WOTLWEDU_SSL`, `WOTLWEDU_SSL_KEY`, `WOTLWEDU_SSL_CERT`
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

The compose stack includes:
- `wotlwedudb` (MariaDB)
- `wotlwedu-backend` (API)

## API docs
Swagger UI assets are in `docs/` and served by the app at `/docs`.

- OpenAPI spec: `docs/openapi.yaml`
- Swagger UI launcher: `docs/index.html`

Additional tenancy endpoints:
- `GET /organization`
- `GET /organization/:organizationId`
- `POST /organization`
- `PUT /organization/:organizationId`
- `DELETE /organization/:organizationId`

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

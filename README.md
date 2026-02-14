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
The backend currently ships as version **0.0.10** (see `package.json` and `CHANGELOG.md`).

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

## AI-assisted features
All AI endpoints are authenticated and use deterministic, self-hosted heuristics (no external LLM dependency).

- `GET /ai/election/:electionId/recommendations`: Recommend election items based on voting activity and text heuristics.
- `POST /ai/list/suggest-items`: Generate list item suggestions from a prompt with inferred category.
- `GET /ai/election/:electionId/summary`: Build a summary of election participation and leading items.
- `GET /ai/notification/digest`: Return a digest of notification activity, unread count, and recent items.
- `GET /ai/election/:electionId/suggest-participants`: Suggest likely participants from friend/activity signals.
- `POST /ai/item/categorize`: Categorize arbitrary text into a likely item category.
- `POST /ai/moderate`: Flag unsafe terms and return moderation severity.
- `GET /ai/image/:imageId/describe`: Generate an image description from image metadata.
- `GET /ai/preferences/defaults`: Infer smart defaults from stored user preferences.
- `POST /ai/assistant/query`: Handle assistant-style freeform queries with deterministic intent routing.

## Notes for contributors
- Response format helper: `util/statusresponse.js`
- Auth middleware and capability checks: `util/security.js`
- Housekeeping jobs run periodically from `app.js`
- Codebase overview: `docs/codebase_overview.md`

## Database version contract (update authors)
- `metadata` must contain `name = database.version` with a numeric string value.
- Each `updates/update-*.js` file must export `targetDatabaseVersion` as an integer.
- Update execution is gated by version: an update runs only when `database.version < targetDatabaseVersion`.
- After a successful update, the updater records the module as applied and sets `database.version` to that update's `targetDatabaseVersion`.
- New update modules should increment the version by exactly one from the previous highest update.

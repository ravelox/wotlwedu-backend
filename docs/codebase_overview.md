# Codebase Overview

## Application entrypoint

The API server boots from [`app.js`](../app.js) using Express.

Startup sequence:
- Loads config from [`config/wotlwedu.js`](../config/wotlwedu.js).
- Aborts early if `WOTLWEDU_JWT_SECRET` is missing.
- Logs backend version from `package.json`.
- Loads DB adapter via [`util/database.js`](../util/database.js).
- Sets up model associations via [`model/associations.js`](../model/associations.js).
- Registers all route modules and middleware.
- Starts HTTP/HTTPS listener only after `database.authenticate()` succeeds.
- Starts housekeeping interval tasks.
- Initializes Socket.IO registration hooks.

For tests (`NODE_ENV=test`), `app.js` exports the Express app and skips starting listeners.

## Configuration

Runtime configuration is centralized in [`config/wotlwedu.js`](../config/wotlwedu.js) and primarily driven by environment variables.

Key settings:
- App bind address/port (`WOTLWEDU_APP_LISTEN`, `WOTLWEDU_APP_PORT`)
- DB settings and adapter selection (`WOTLWEDU_DB_*`, `WOTLWEDU_DB_TYPE`)
- JWT auth secret (`WOTLWEDU_JWT_SECRET`)
- SSL enablement and cert/key paths (`WOTLWEDU_SSL`, `WOTLWEDU_SSL_KEY`, `WOTLWEDU_SSL_CERT`)
- API/frontend/image URLs
- Housekeeping interval
- Mail provider configuration

## Database and models

Database access is abstracted through [`util/database.js`](../util/database.js), which selects an ORM adapter:
- `sequelize` (default)
- `mongoose`
- `pg` / `postgres` / `postgresql`

Model definitions live in [`model/`](../model) and include core entities such as users, roles, capabilities, groups, lists/items, elections/votes, images, preferences, notifications, friendships, and statuses.

Relationships are defined in [`model/associations.js`](../model/associations.js). In sqlite test mode, a reduced association set is used to simplify integration tests.

## Routing and middleware

Route modules are in [`routes/`](../routes) with controllers in [`controllers/`](../controllers).

Unauthenticated routes:
- `/login`
- `/register`

Authenticated route groups (all behind `Security.checkAuthentication`):
- `/ping`, `/helper`, `/user`, `/role`, `/capability`, `/item`, `/list`, `/group`, `/image`, `/category`, `/election`, `/vote`, `/preference`, `/cast`, `/notification`, `/ai`

Response payloads typically use [`util/statusresponse.js`](../util/statusresponse.js):
```json
{ "status": 200, "message": "OK", "data": { ... } }
```

## Security model

Authentication and capability authorization are implemented in [`util/security.js`](../util/security.js):
- JWT auth from `Authorization` header (supports optional `Bearer ` prefix).
- Rejects missing/invalid tokens.
- Rejects inactive users (`active === false`).
- Attaches `req.authUserId`, `req.authName`, and `req.isAdmin`.
- Per-route capability checks via `checkCapability(object, ops)`.

## AI-assisted endpoints

The AI feature set is deterministic and self-hosted (no external LLM/API dependency).

Implementation:
- Routes: [`routes/ai.js`](../routes/ai.js)
- Controller: [`controllers/ai.js`](../controllers/ai.js)
- Heuristics/utilities: [`util/ai.js`](../util/ai.js)

Supported `/ai/*` capabilities include:
- election recommendations
- list item suggestions from prompt
- election summaries
- notification digest
- participant suggestions
- text categorization
- text moderation
- image description from metadata
- smart defaults from preferences
- assistant query routing

These use existing application models (`Election`, `Vote`, `Item`, `User`, `Notification`, `Friend`, `Image`, `Preference`, etc.) and do not require schema changes.

## Real-time features and housekeeping

Socket.IO support is in [`util/wotlwedu-socketio.js`](../util/wotlwedu-socketio.js) and is used for notifications/refresh events with per-user socket registration.

Periodic housekeeping is handled by [`util/housekeeping.js`](../util/housekeeping.js), invoked on an interval from `app.js`.

## Testing

Tests are run with:
```bash
npm test
```

Test harness:
- Runner: [`tests/run-tests.js`](../tests/run-tests.js)
- Unit tests: [`tests/unit-tests.js`](../tests/unit-tests.js)
- Integration tests: [`tests/routes.integration.test.js`](../tests/routes.integration.test.js)

Integration tests can self-skip in unsupported DB dialect contexts.

## API documentation

OpenAPI spec: [`docs/openapi.yaml`](openapi.yaml)

Swagger UI entrypoint: [`docs/index.html`](index.html)
- Serves interactive docs at `/docs`
- Loads `/docs/openapi.yaml`

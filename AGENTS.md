# AGENTS.md (wotlwedu-backend)

Local instructions for Codex-style agents working in this repository.

## Repo Summary

- App: REST API backend for the wotlwedu ecosystem.
- Package: `wotlwedu-backend` version `0.0.61`.
- Stack: Node.js, Express, Sequelize, MariaDB by default.
- Auth: JWT bearer tokens, optional Google/social login, OTP-based 2FA.
- Real-time: Socket.IO notifications.
- Mail: SMTP, Mailgun, or AWS SES.
- API wording: user-facing features are polls; backend resources often still use
  `election`.

## Key Commands

```bash
npm install
npm start
npm run dev
npm test
npm run test:live-notification
npm run validate:deployed-support
```

`npm test` runs `node tests/run-tests.js`. Live notification tests expect a
running API/socket environment and set `WOTLWEDU_LIVE_NOTIFICATION=1`.

## Runtime Configuration

- Required for normal app startup: `WOTLWEDU_JWT_SECRET`.
- Default app port: `9876`.
- Default database adapter: Sequelize/MariaDB.
- Optional adapter flag: `WOTLWEDU_DB_TYPE`, with mongoose/postgres support in
  `orm/`; schema update execution is still Sequelize-oriented.
- Main config file: `config/wotlwedu.js`.
- Local compose entrypoint: root `../docker-compose.yaml` or this repo's
  `docker-compose.yaml`, depending on the workflow.

## Data And Updates

- Baseline schema entrypoint: `model/util-createdb.js`.
- Update runner entrypoint: `model/util-updatedb.js`.
- Shared update utility: `util/dbupdate.js`.
- Update modules live in `updates/update-*.js`.
- Update modules must be idempotent and tracked in the `metadata` table.
- Associations are centralized in `model/associations.js`.
- Use `WOTLWEDU_FORCE_SEQUELIZE_FOR_UPDATES=true` when an update flow must force
  the Sequelize path.

## Where To Make Changes

- App entry and route registration: `app.js`.
- Environment-driven config: `config/wotlwedu.js`.
- Routes: `routes/`.
- Business logic: `controllers/`.
- Models and associations: `model/`.
- ORM adapters: `orm/`.
- Shared middleware/helpers: `util/`.
- Mail providers: `mailprovider/`.
- Database updates: `updates/`.
- Tests: `tests/`.
- Deployment: `Dockerfile`, `docker-entrypoint.sh`, `k8s/`.
- API docs: `docs/openapi.yaml`, `docs/curl-examples.md`.

## Tenant And Auth Rules

- Organizations are tenant boundaries.
- Workgroups are organization-scoped sub-units.
- Workgroup-scoped resources include items, images, lists, and elections/polls.
- Category assignment is user-scoped by category creator ownership.
- Keep capability checks in `util/security.js` aligned with route behavior.
- Public poll and abuse/audit logic lives around `controllers/publicelection.js`,
  `util/public-poll.js`, and `util/abuse-audit.js`.

## Response And Route Conventions

- Keep routes thin; put logic in controllers.
- Return API responses through `util/statusresponse.js`.
- Keep OpenAPI docs and curl examples aligned when route behavior changes.
- Preserve legacy naming and redirects unless a migration plan explicitly changes
  them.

## Testing Expectations

- Run `npm test` for backend behavior changes when practical.
- Add or update tests in `tests/unit-tests.js` or `tests/routes.integration.test.js`
  for utility, controller, or route contract changes.
- Use `npm run test:live-notification` for Socket.IO behavior when a running
  environment is available.
- Mention any skipped tests or environment blockers in the final response.

## Repo Hygiene

- Do not commit `node_modules/`, `.env*`, secrets, certificates, generated dumps,
  or local archives.
- Keep `README.md`, `CHANGELOG.md`, `docs/openapi.yaml`, and deployment manifests
  aligned with behavior changes.
- Follow existing CommonJS/Express style unless a touched file already uses a
  different pattern.

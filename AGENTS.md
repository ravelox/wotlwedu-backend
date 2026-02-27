# AGENTS.md (wotlwedu-backend)

Local instructions for Codex-style agents working in this repository.

## Repo Summary
- App: REST API backend for the wotlwedu ecosystem
- Stack: Node.js + Express + Sequelize (default MariaDB)
- Alt adapter flags exist (`WOTLWEDU_DB_TYPE`), but update execution is Sequelize-based

## Key Commands
```bash
npm install
npm start
npm run dev
npm test
```

## Data/Update Notes
- DB update runner entrypoint: `model/util-updatedb.js`
- Update modules live in `updates/update-*.js`
- Startup scripts:
  - `model/util-createdb` (baseline schema)
  - `model/util-updatedb` (incremental/idempotent updates)

## Where To Make Changes
- Routes: `routes/`
- Business logic: `controllers/`
- Data models/associations: `model/`
- Update modules: `updates/`
- Shared helpers/middleware: `util/`
- API docs: `docs/openapi.yaml`, `docs/curl-examples.md`

## Tenant/Scope Rules
- Organizations are tenant boundaries.
- Workgroups are org-scoped sub-units.
- Category assignment is user-scoped (category creator ownership).
- Workgroup-scoped resources: items, images, lists, elections.

## Repo Hygiene
- Do not commit `node_modules/`, `.env*`, secrets, certificates, or generated dumps.
- Keep docs/changelog in sync with behavior changes.

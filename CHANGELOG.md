# Changelog

## Unreleased

## 0.0.56 - 2026-05-15
- Add database update `update-0024` to seed a non-admin `user_default` account in the default organization during initialization with the three-word default password `default user password`.

## 0.0.55 - 2026-05-15
- Add `/support/ops/overview` for tenant scale, session, mail, storage, and update-state dashboard data.
- Add `/support/publicpoll/suppression` so support can suppress public-poll invite recipients with abuse-audit logging.

## 0.0.54 - 2026-05-14
- Emit Socket.IO poll-update events when polls start, close, or receive votes so consumer clients can refresh live poll state.

## 0.0.53 - 2026-05-14
- Add provider-based media storage with local development storage and S3-compatible production storage for AWS S3, MinIO, or compatible providers.
- Complete the public poll backend contract with public response context, guest-session expiry, guest vote quota enforcement, and support moderation actions for locking/restoring/removing public access.
- Scope rate-limit counters per protected flow so login, registration, reset, social-link, invite, and public-poll throttles cannot accidentally consume each other's counters for the same IP/body key.
- Add Priority 1 regression coverage for route-scoped rate limiting and unauthenticated picture uploads not writing files.
- Add server-side auth sessions with refresh-token rotation, replay detection, current-user session listing, logout current/all devices, and support session revocation endpoints.
- Add optional HTTP-only refresh-token cookie configuration for browser deployments.
- Change self-service registration to provision a private organization, first personal space, space membership, default role, and active poll tutorial instead of placing users in a shared default tenant.

## 0.0.50 - 2026-05-10
- Add production security hardening: Helmet headers, configured body limits, production-safe 500 error redaction, deliberate trust-proxy configuration, and stricter production CORS defaults.
- Move picture uploads fully behind authenticated capability/object authorization and validate upload size, extension, MIME type, and image magic bytes before accepting files.
- Add database-backed rate-limit counters for production/shared app replicas and extend throttles to registration, refresh, and password reset completion flows.

## 0.0.49 - 2026-05-10
- Refresh Codex agent guidance for the backend repository.
- Update README and OpenAPI documentation for current backend routes and release metadata.

## 0.0.48 - 2026-05-07
- Add unit coverage for the database update runner when update metadata exists but the physical schema change is still unapplied.
- Keep update reapplication behavior covered so partially migrated databases can self-heal predictably.

## 0.0.47 - 2026-05-07
- Add `POST /tutorial/poll/dismiss` so clients can dismiss the current poll tutorial prompt without marking the tutorial permanently skipped.
- Extend tutorial controller behavior for dismissible tutorial prompts.

## 0.0.46 - 2026-05-07
- Improve database update logging across existing update modules and the shared update runner.
- Refresh the update module template with the current logging pattern.

## 0.0.45 - 2026-05-06
- Add system-admin `GET /admin/config` for safe runtime configuration visibility.
- Add local SMTP provider support for development mail capture.
- Extend unit coverage around admin config redaction and SMTP behavior.

## 0.0.44 - 2026-05-05
- Allow list filters to match resource IDs across backend collection endpoints.

## 0.0.43 - 2026-05-05
- Rename persisted terminology tables to `people`, `circles`, `pictures`, `spaces`, `polls`, and matching join-table names via update module `update-0019`.
- Update poll notification status copy from election/picture terminology to poll/picture terminology.
- Widen preference values to `TEXT` via update module `update-0020` so tutorial state can be stored without truncation.
- Update tutorial copy and generated tutorial list names from Options to Ideas.
- Remove legacy terminology endpoint aliases so clean installs expose only Person, Circle, Picture, Space, and Poll routes.
- Add `/v1` API route versioning across backend endpoints.

## 0.0.42 - 2026-04-08
- Refactor mail payload generation into deterministic internal builders so invite, confirmation, password-reset, email-change, and public-poll mail content can be tested directly.
- Add unit coverage for configured deep links, frontend URL fallback behavior, support email copy, invite expiry text, and public-poll invite URL encoding.
- Harden release verification around mailer and invite flows without changing API contracts.

## 0.0.41 - 2026-04-08
- Add support auth observability via `GET /support/auth/overview` and `GET /support/auth/audit`, including scoped aggregate metrics and paged audit feeds for admin/support workflows.
- Add structured stdout auth-audit logging behind `WOTLWEDU_AUTH_AUDIT_STDOUT` so deployed environments can forward auth/invite events into log pipelines without bypassing database persistence.
- Add linked sign-in method visibility and unlink support plus user/organization auth-audit query endpoints for admin/support tooling.
- Return structured organization-invite conflict diagnostics when an invite target already belongs to another organization.
- Add support email and deep-link configuration for invite/password-reset/confirmation email templates, ship HTML mail output, and document the corresponding environment variables in `.env.example`.
- Reconcile release metadata so the documented backend version matches the shipped auth/support feature set.

## 0.0.40 - 2026-03-28
- Add a real poll-creation tutorial API via `POST /tutorial/poll/start` and `GET /tutorial/poll` that persists per-user tutorial state, suggests exact resource names, binds to the actual list/circle/poll created in the existing UI, and computes progress from real items, audience members, votes, and stats.
- Add tutorial lifecycle controls via `POST /tutorial/poll/skip` and `POST /tutorial/poll/enable`, preserving skipped state until the user explicitly resumes or restarts.
- Add ops remediation via `POST /support/people/:userId/tutorial/poll/enable` so admins can re-enable or restart a user's tutorial.

## 0.0.39 - 2026-03-28
- Add support/public-poll abuse observability endpoints (`GET /support/publicpoll/overview`, `GET /support/publicpoll/audit`) with organization scoping and election/space context.
- Document ownership-transfer preview/apply endpoints and support/public-poll observability in OpenAPI, curl examples, and README.
- Add `/support/...` operator aliases for user diagnostics, organization invite remediation, public-poll management, and test-token mint/revoke so admin tooling can move off consumer resource paths.
- Remove the fixed backend container startup sleep and switch Kubernetes backend probes to HTTP readiness on `/docs/openapi.yaml`, with a configurable DB wait timeout for faster startup.
- Add poll participation follow-up via `POST /poll/:electionId/remind`, persisting reminder notifications and exposing reminder counts/last-reminder metadata in `GET /poll/:electionId/participation`.

## 0.0.33 - 2026-03-26
- Remove `CHECKPOINT.md` as part of the cross-repo cleanup.
- Add public election links with unauthenticated view/session/vote/report endpoints backed by dedicated guest participant and vote tables.
- Add trust-gated public election invite management, suppression tracking, and abuse-audit persistence so authenticated poll owners cannot fan out messages without passing quota and trust checks.

## 0.0.31 - 2026-03-25
- Make deployed support/auth validation scripts accept login credentials, auto-discover user and organization scope, and optionally write JSON reports.
- Update backend docs and checkpoint guidance to reflect the improved live validation workflow.

## 0.0.30 - 2026-03-25
- Add explicit `organizationId` narrowing support for `GET /person` and `GET /space` to improve admin relation search precision.
- Add deployed support/auth validation tooling via `npm run validate:deployed-support`.
- Extend sqlite integration coverage for organization-scoped user/space filtering.

## 0.0.29 - 2026-03-24
- Refresh the backend checkpoint to reflect `wotlwedu-admin` as the active operational console.
- Mark `wotlwedu-browser` and `wotlwedu-minimal` as archived counterparts in current project status.

## 0.0.25 - 2026-03-24
- Add post-auth social link confirmation endpoints (`POST /login/google/link`, `POST /login/social/link`) for verified provider sign-ins that match an existing password-based account.
- Change social/Google first-link behavior so the backend returns a neutral `linkRequired` state plus a short-lived link token instead of auto-linking immediately.
- Extend integration coverage for deferred social linking and duplicate-provider-link protection.

## 0.0.26 - 2026-03-24
- Add persistent `authaudits` records for password sign-in, social sign-in, deferred link confirmation, invite lookup, invite acceptance, invite create/resend/revoke flows, and blocked auth edge cases.
- Add dedicated rate limits for invite lookup, invite management, and deferred social-link confirmation on top of the existing auth throttles.
- Refuse automatic social linking when a verified social sign-in matches an existing non-password account, returning a manual-support path instead of risking ambiguous account state.

## 0.0.24 - 2026-03-24
- Add organization invite default expiry policy via `WOTLWEDU_ORG_INVITE_EXPIRY_DAYS` and retain invite history with derived statuses for pending, accepted, revoked, and expired records.
- Preserve revoked invites as historical records instead of deleting them, and expose invite status filtering for organization admin tooling.
- Add schema support for invite revocation metadata and extend integration coverage for expired/revoked invite history.

## 0.0.23 - 2026-03-24
- Add invite lifecycle controls for organizations, including public invite lookup, pending invite listing, resend/regenerate, and revoke flows.
- Add default organization invite expiry (`WOTLWEDU_ORG_INVITE_EXPIRY_DAYS`, default 7 days) and retained invite history with derived statuses (`pending`, `accepted`, `revoked`, `expired`).
- Tighten social invite acceptance to require an explicit invite token whose email matches the Google account used for first sign-in.
- Extend backend tests and API documentation for invite-aware login and invite lifecycle operations.

## 0.0.22 - 2026-03-19
- Add verified Google web sign-in via `POST /login/google` using Google ID token validation against `WOTLWEDU_GOOGLE_CLIENT_ID`.
- Add `POST /login/social` for JIT social sign-in based on provider identity, linking repeat logins through persisted `socialidentities`.
- Add `organizationinvites` for email-based org invitation and `POST /organization/:organizationId/invite` for org admins/system admins.
- Add public invite lookup via `GET /login/invite/:token` plus org-admin pending invite listing via `GET /organization/:organizationId/invite`.
- Add invite lifecycle controls for org admins: resend/regenerate link via `POST /organization/:organizationId/invite/:inviteId/resend` and revoke via `DELETE /organization/:organizationId/invite/:inviteId`.
- Tighten invite acceptance so first-time social sign-in consumes an invite only when the supplied invite token matches the Google account email; otherwise it auto-provisions a new organization named `<FirstInitial> <LastInitial>'s Organization`.
- Auto-provisioned social users are activated immediately, verified, assigned the default role, and made `organizationAdmin` for their new tenant.

## 0.0.21 - 2026-03-09
- Harden authentication endpoints with rate limiting on login/register/password-reset and test-token issuance/revocation flows.
- Add configurable CORS allowlist and trusted frontend URL handling for safer local and deployed environment configuration.
- Tighten reset and registration token handling/validation paths used by login and user controllers.

## 0.0.20 - 2026-03-09
- Add opt-in live notification test tooling (`tests/live-notification.test.js` and `npm run test:live-notification`) so notifications can be triggered against a running backend while validating updates in a live UI session.
- Add system-admin test-token minting (`POST /login/testtoken`) with custom `expiresInMinutes`, plus persisted token records and revocation (`POST /login/testtoken/revoke`).
- Enforce test-token revocation/expiry checks in authentication middleware using persisted `testtokens` records.

## 0.0.19 - 2026-03-09
- Add `POST /login/testtoken` for system-admin-only minting of short-lived testing bearer tokens for a target active user.
- Support user-specified token duration via `expiresInMinutes` (integer, 1..43200 minutes).
- Add `POST /login/testtoken/revoke` and persistent test-token tracking (`testtokens`) so issued testing tokens can be revoked before expiry.
- Enforce revocation checks during authentication for tokens minted with `kind: "test"`.

## 0.0.18 - 2026-02-28
- Normalize `item.workgroupId` inputs through the shared ID normalizer on list/create/update paths so placeholder values like `" undefined "` and `" null "` do not trigger inconsistent item-scoping behavior.

## 0.0.17 - 2026-02-28
- Add optional Helm ingress support to `k8s/`.
- Add optional per-environment Helm service/ingress overrides via `environment` and `environments.<name>.*` values.
- Make notification listing paginated and newest-first, and make unread counts use a database count instead of loading all unread rows.
- Clean up notification API response payloads to return `notification` consistently for create/update/status operations.
- Make item/list/picture share acceptance re-check friendship and execute the copy/delete flow through a transaction-aware code path.
- Emit structured notification socket payloads (`kind`, `notificationId`, `unreadCount`, optional `notification`) for client-side delta updates instead of only firing a bare invalidation signal.

## 0.0.15 - 2026-02-27
- Make the update runner adapter-independent from runtime `WOTLWEDU_DB_TYPE` by forcing Sequelize for update execution (`model/util-updatedb.js` + `util/database.js`).
- This keeps update modules portable across configured runtime adapters while preserving existing Sequelize-based update implementations.

## 0.0.14 - 2026-02-27
- Protect `/organization` routes with capability checks (`view`, `add`, `edit`, `delete`) in the router layer.
- Harden Docker startup flow by always running `model/util-createdb` before `model/util-updatedb` so baseline tables are created when DB exists but schema is missing.
- Ignore macOS Finder metadata files via `.DS_Store` in `.gitignore`.

## 0.0.13 - 2026-02-27
- Add consistent `categoryId` projection/handling across category-enabled resources (`group`, `workgroup`, `image`, `item`, `list`, `election`).
- Enforce per-user category ownership when assigning `categoryId` on create/update (with explicit null clearing support).
- Add optional category-grouped response menus (`?collapsible=true`) for category-enabled collection endpoints.
- Normalize workgroup/organization ID inputs (`""`, `"undefined"`, `"null"`) to avoid false `421` errors from frontend placeholder values.

## 0.0.12 - 2026-02-14
- Support workgroup-scoped user listing via `GET /person?workgroupId=...` (used by the browser console when a workgroup scope is selected).

## 0.0.11 - 2026-02-14
- Make DB update modules safer/idempotent: avoid destructive `sync({ force: true })` and guard role/capability/person-role assignments against duplicates.
- Update README to reflect the actual DB update runner behavior (metadata-per-update-id + optional physical checks), not `database.version` gating.

## 0.0.10 - 2026-02-14
- Fix Sequelize Workgroup/WorkgroupMember association direction that could generate an invalid FK and prevent `workgroups` table creation.
- Fix auth middleware boolean parsing for admin flags (`true/false`, `0/1`, `"true"/"false"`) when using `raw: true` with SQL dialects.
- Allow authenticated users to read their own organization while keeping organization management endpoints restricted to admins.

## 0.0.9 - 2026-02-14
- Workgroup endpoints self-heal by creating missing `workgroups` tables on first access (useful for partially initialized DBs).

## 0.0.8 - 2026-02-14
- Make DB updates more resilient on partially migrated databases (re-apply when metadata exists but schema changes are missing).
- Ensure startup fails fast if database updates fail (docker entrypoint checks `util-updatedb` exit code).
- Prevent unhandled promise rejection in `/space` listing when the table is missing.

## 0.0.7 - 2026-02-14
- Fix DB update runner startup crash when the database exists but is missing newer columns (avoid global `sequelize.sync()` before updates).

## 0.0.6 - 2026-02-14
- Add dedicated workgroup model/API (separate from election audience groups) and org-scoped access controls.
- Add organization/space capabilities and grant them to the Root Role via `update-0008`.
- Add workgroup-scoped administration for items/images/lists/elections (admins can target a workgroup).
- Harden DB update runner to apply only `update-\\d+.js` and backfill metadata when updates are already applied.
- Add comprehensive curl examples for key endpoints (including organization/space and scoped resources).

## 0.0.5 - 2026-02-13
- Add multi-tenant foundations with organizations and organization-scoped workgroups.
- Add explicit user classifications: `systemAdmin`, `organizationAdmin`, and `workgroupAdmin` (single admin workgroup via `adminGroupId`).
- Add organization management endpoints (`/organization`) and tenant-aware auth context/scope helpers in security middleware.
- Add database updates `update-0006` and `update-0007` for tenancy and system-admin schema/data migration.
- Remove legacy `TODO` file.

## 0.0.4 - 2026-02-12
- Add authenticated `/ai` route module with deterministic AI-assisted endpoints for recommendations, summaries, suggestions, moderation, categorization, metadata description, and assistant queries.
- Add `controllers/ai.js` and `util/ai.js` to provide self-hosted heuristic logic using existing models and `StatusResponse`.
- Document all `/ai/*` endpoints in OpenAPI and README, and add unit tests for text categorization, moderation, and list suggestion behavior.

## 0.0.3 - 2025-12-16
- Log backend version at startup and enforce presence of `WOTLWEDU_JWT_SECRET`.
- Reject login for inactive accounts to prevent issuing tokens for disabled users.
- Allow JWT auth header to include optional `Bearer` prefix.

# Changelog

## 0.0.25 - 2026-03-24
- Add post-auth social link confirmation endpoints (`POST /login/google/link`, `POST /login/social/link`) for verified provider sign-ins that match an existing password-based account.
- Change social/Google first-link behavior so the backend returns a neutral `linkRequired` state plus a short-lived link token instead of auto-linking immediately.
- Extend integration coverage for deferred social linking and duplicate-provider-link protection.

## 0.0.26 - 2026-03-24
- Add persistent `authaudits` records for password sign-in, social sign-in, deferred link confirmation, invite lookup, invite acceptance, invite create/resend/revoke flows, and blocked auth edge cases.
- Add dedicated rate limits for invite lookup, invite management, and deferred social-link confirmation on top of the existing auth throttles.
- Refuse automatic social linking when a verified social sign-in matches an existing non-password account, returning a manual-support path instead of risking ambiguous account state.

## Unreleased
- Add support observability endpoints for aggregated auth/invite metrics and paged support audit feeds.
- Add structured stdout auth-audit logging via `WOTLWEDU_AUTH_AUDIT_STDOUT`.
- Add linked sign-in method visibility/unlink support at the user level, plus user/org auth audit query endpoints for admin/support tooling.
- Return structured organization-invite conflict diagnostics when an invite target already belongs to another organization.
- Add support email and deep-link configuration for invite/password-reset/confirmation email templates, plus HTML mail output and `.env.example`.

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
- Make item/list/image share acceptance re-check friendship and execute the copy/delete flow through a transaction-aware code path.
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
- Support workgroup-scoped user listing via `GET /user?workgroupId=...` (used by the browser console when a workgroup scope is selected).

## 0.0.11 - 2026-02-14
- Make DB update modules safer/idempotent: avoid destructive `sync({ force: true })` and guard role/capability/user-role assignments against duplicates.
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
- Prevent unhandled promise rejection in `/workgroup` listing when the table is missing.

## 0.0.7 - 2026-02-14
- Fix DB update runner startup crash when the database exists but is missing newer columns (avoid global `sequelize.sync()` before updates).

## 0.0.6 - 2026-02-14
- Add dedicated workgroup model/API (separate from election audience groups) and org-scoped access controls.
- Add organization/workgroup capabilities and grant them to the Root Role via `update-0008`.
- Add workgroup-scoped administration for items/images/lists/elections (admins can target a workgroup).
- Harden DB update runner to apply only `update-\\d+.js` and backfill metadata when updates are already applied.
- Add comprehensive curl examples for key endpoints (including organization/workgroup and scoped resources).

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

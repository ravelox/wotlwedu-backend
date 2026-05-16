# Backup And Restore Runbook

This runbook covers MariaDB metadata and uploaded media for production
deployments.

## Scope

A complete backup has two parts:

- Database state: organizations, users, spaces, polls, votes, sessions, invites,
  audits, and metadata.
- Media state: image objects stored through the configured media provider.

The support API also exposes JSON backup and restore endpoints for system,
organization, and space scopes. Use those endpoints for tenant-scoped support
operations; use database and object-storage backups for disaster recovery.

## Scheduled MariaDB Backups

1. Run `mariadb-dump` or your managed database provider's snapshot tool on a
   schedule appropriate for the recovery point objective.
2. Include routines, triggers, and events if the deployment adds them later.
3. Store dumps or snapshots in encrypted durable storage.
4. Retain at least one recent backup outside the primary region.
5. Record the database version, app version, and migration/update state with the
   backup.

Example logical dump:

```bash
mariadb-dump \
  --host "$WOTLWEDU_DB_HOST" \
  --user "$WOTLWEDU_DB_USER" \
  --password="$WOTLWEDU_DB_PASSWORD" \
  --single-transaction \
  --routines \
  --events \
  "$WOTLWEDU_DB_NAME" > "wotlwedu-$(date +%Y%m%d%H%M%S).sql"
```

## Scheduled Media Backups

For S3-compatible storage:

1. Enable bucket versioning where available.
2. Enable lifecycle retention according to the data retention policy.
3. Replicate the bucket or tenant prefixes to a secondary region/provider when
   required.
4. Back up the bucket policy and encryption-key configuration.

For local development storage, copy `public/images` or the configured
`WOTLWEDU_IMAGE_DIR`. Local filesystem storage is not recommended for
production app replicas.

## Restore Drill

Run a restore drill before each production launch and at least quarterly.

1. Create an isolated restore environment.
2. Restore the MariaDB dump or snapshot.
3. Restore media objects or attach the restored bucket/prefix.
4. Configure the app with the restored database and media provider.
5. Start the backend and confirm:
   - `GET /healthz` returns `200`.
   - `GET /readyz` returns `200`.
   - A known user can sign in.
   - A known private poll can be viewed.
   - A known public poll link can be viewed.
   - A known image URL resolves.
6. Run `npm run validate:deployed-support` against the restored environment
   with a support token.
7. Record restore duration and any manual steps.

## Tenant-Scoped JSON Backups

Support operators can use backend support endpoints for JSON exports:

- system scope for full logical export
- organization scope for tenant export
- space scope for a single space export

Treat these files as sensitive. They may contain account details, poll data,
invite history, and audit records. Store exports encrypted and delete temporary
copies after the support task is complete.

## Restore Safety

- Restore into an isolated environment first.
- Confirm the target scope before applying a JSON restore.
- Keep the source backup immutable.
- Record the operator, reason, source backup ID, target environment, and
  validation result in the incident or change ticket.
- After a production restore, immediately verify `/readyz`, inspect structured
  logs by `requestId`, and monitor error/latency metrics.

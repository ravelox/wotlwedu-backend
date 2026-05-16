# Privacy, Retention, And Abuse Operations

This document defines the consumer privacy workflows and operator retention
expectations for public wotlwedu usage.

## Consumer Workflows

- Account data export: signed-in users can call
  `GET /v1/person/:userId/privacy/export` from the Profile page. The export
  includes account profile data, organization and space membership, sessions,
  linked sign-in providers, notifications, and recent auth audit events.
- Account deletion request: signed-in users can call
  `POST /v1/person/:userId/privacy/delete-request` from the Profile page. The
  request is recorded in `authaudits` as `account_deletion_requested` for
  support review before shared organization data is deleted or transferred.
- Public invite unsubscribe: public poll invite emails include
  `/public/unsubscribe/:inviteToken`. The UI calls
  `POST /v1/public/poll/invite/:inviteToken/unsubscribe`, creates an email
  suppression record, and blocks future public poll email invites to that
  recipient.
- Guest voting consent: invite emails and the public poll guest session form
  explain that Wotlwedu stores display name, invite state, votes, and abuse
  signals needed to operate the poll.

## Retention Windows

These values are configurable through environment variables and are exposed in
`config/wotlwedu.js`.

| Data class | Config | Default | Operator workflow |
| --- | --- | ---: | --- |
| Auth audits | `WOTLWEDU_RETENTION_AUTH_AUDIT_DAYS` | 365 days | Keep login, invite, export, deletion, and support events for security review, then purge or archive according to deployment policy. |
| Public poll participants | `WOTLWEDU_RETENTION_PUBLIC_PARTICIPANT_DAYS` | 180 days | Retain guest session, display name, invite status, and vote linkage long enough for poll review and abuse response. |
| Abuse reports and audits | `WOTLWEDU_RETENTION_ABUSE_AUDIT_DAYS` | 730 days | Retain reports, moderation actions, and blocked invite events for repeat-abuse investigation. |
| Notifications | `WOTLWEDU_RETENTION_NOTIFICATION_DAYS` | 180 days | Purge stale read notifications after user-visible usefulness expires. |
| Deleted users | `WOTLWEDU_RETENTION_DELETED_USER_DAYS` | 30 days | Hold minimal deletion review records before final anonymization or purge, unless legal/security needs require longer retention. |

## Deletion Review Checklist

1. Confirm the requester controls the account email or is an authorized support
   operator for the tenant.
2. Export account data first when the user requests a copy.
3. Review organization-owned resources created by the user: polls, lists, ideas,
   images, spaces, public invites, and notifications.
4. Transfer shared resources when deleting them would disrupt other users, or
   delete/anonymize personal resources that are not needed for security or abuse
   review.
5. Revoke active sessions after the deletion has been approved.
6. Record completion in the support/audit trail.

## Abuse Policy

Users and guests can report spam, harassment, unsafe links, impersonation,
private-information exposure, and other abusive public poll content from the
public poll page. Reports create abuse audit records for support review.
Operators may lock a public poll, remove public access, restore after review,
or restrict invite privileges. Invite recipient suppressions must be honored
before sending public poll email invites.

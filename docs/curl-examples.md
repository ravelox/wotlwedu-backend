# Wotlwedu Backend API: curl Examples

This document provides copy/paste `curl` examples for every HTTP endpoint mounted by `wotlwedu-backend` (`app.js`).

## Conventions

Set these once in your shell:

```sh
API="http://localhost:9876"
TOKEN="REPLACE_ME"   # Bearer token from /login
```

Authenticated requests use:

```sh
curl -H "Authorization: Bearer $TOKEN" ...
```

Notes:
- Unless stated otherwise, endpoints require authentication (the server mounts most routers behind `Security.checkAuthentication` in `app.js`).
- `StatusResponse` payloads look like: `{ "status": 200, "message": "OK", "data": { ... } }`.
- **Workgroup scoping** (items/images/lists/elections): admins can target a workgroup by passing `workgroupId` in the JSON body (create/update) or query string (list). The organization is implied by the workgroup.
- **Category ownership**: `categoryId` must reference a category created by the authenticated user.
- **Collapsible category grouping**: collection endpoints for category-enabled resources support `?collapsible=true`, returning an additional grouped `menu` field.

---

## Static (No Auth)

### `GET /favicon.ico`

```sh
curl -i "$API/favicon.ico"
```

### `GET /docs` (static docs directory)

```sh
curl -sS "$API/docs/openapi.yaml" | head
```

```sh
curl -sS "$API/docs/index.html" | head
```

---

## Ping

### `GET /ping`

```sh
curl -sS "$API/ping" -H "Authorization: Bearer $TOKEN"
```

---

## Login

### `POST /login` (get authToken + refreshToken)

```sh
curl -sS "$API/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"root@localhost.localdomain","password":"REPLACE_ME"}'
```

### `POST /login/refresh` (refresh authToken)

```sh
curl -sS "$API/login/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"REPLACE_ME"}'
```

### `POST /login/resetreq` (request password reset email)

```sh
curl -sS "$API/login/resetreq" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### `PUT /login/password/:userid` (complete password reset)

```sh
USER_ID="user_000"
curl -sS "$API/login/password/$USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"token":"REPLACE_ME","password":"NewPasswordHere"}'
```

### `POST /login/2fa` (enable 2FA; requires auth)

```sh
curl -sS "$API/login/2fa" -H "Authorization: Bearer $TOKEN"
```

### `POST /login/gentoken` (generate 2FA verification token; requires auth)

```sh
curl -sS "$API/login/gentoken" -H "Authorization: Bearer $TOKEN"
```

### `POST /login/testtoken` (system-admin testing token mint; requires auth)

```sh
curl -sS "$API/login/testtoken" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_000","expiresInMinutes":120}'
```

Preferred operator alias:

```sh
curl -sS "$API/support/session/testtoken" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_000","expiresInMinutes":120}'
```

### `POST /login/testtoken/revoke` (revoke a previously minted test token; requires auth)

```sh
curl -sS "$API/login/testtoken/revoke" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tokenId":"wotlwedu_000"}'
```

Preferred operator alias:

```sh
curl -sS "$API/support/session/testtoken/revoke" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tokenId":"wotlwedu_000"}'
```

### `POST /login/verify2fa` (verify 2FA)

This route is mounted with `Security.bypassCheck` and can be called without an Authorization header.

```sh
curl -sS "$API/login/verify2fa" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_000","verificationToken":"REPLACE_ME","authToken":"123456"}'
```

---

## Register

### `POST /register` (request registration)

```sh
curl -sS "$API/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"new.user@example.com","firstName":"New","lastName":"User","password":"REPLACE_ME"}'
```

### `POST /register/confirm/:tokenId` (confirm registration)

```sh
TOKEN_ID="wotlwedu_000"
curl -sS "$API/register/confirm/$TOKEN_ID" -X POST
```

---

## Organization

### `GET /organization`

```sh
curl -sS "$API/organization" -H "Authorization: Bearer $TOKEN"
```

### `GET /organization/:organizationId`

```sh
ORG_ID="org_000"
curl -sS "$API/organization/$ORG_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /organization`

```sh
curl -sS "$API/organization" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Org","description":"Example"}'
```

### `PUT /organization/:organizationId`

```sh
ORG_ID="org_000"
curl -sS "$API/organization/$ORG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed Org"}'
```

### `DELETE /organization/:organizationId`

```sh
ORG_ID="org_000"
curl -sS "$API/organization/$ORG_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

## Support

### `GET /support/auth/overview`

```sh
curl -sS "$API/support/auth/overview?organizationId=org_000&days=7" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/auth/audit`

```sh
curl -sS "$API/support/auth/audit?organizationId=org_000&outcome=failure&items=25" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/publicpoll/overview`

```sh
curl -sS "$API/support/publicpoll/overview?organizationId=org_000&days=7&eventType=public_poll_reported" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/publicpoll/audit`

```sh
curl -sS "$API/support/publicpoll/audit?organizationId=org_000&items=25&electionId=election_000" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/users/:userId/signin-method`

```sh
USER_ID="user_000"
curl -sS "$API/support/users/$USER_ID/signin-method" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/users/:userId/authaudit`

```sh
USER_ID="user_000"
curl -sS "$API/support/users/$USER_ID/authaudit?items=25" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/organizations/:organizationId/invite`

```sh
ORG_ID="org_000"
curl -sS "$API/support/organizations/$ORG_ID/invite?status=pending" \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /support/organizations/:organizationId/invite`

```sh
ORG_ID="org_000"
curl -sS "$API/support/organizations/$ORG_ID/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com"}'
```

### `GET /support/elections/public/trust`

```sh
curl -sS "$API/support/elections/public/trust" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /support/elections/:electionId/public/stats`

```sh
ELECTION_ID="election_000"
curl -sS "$API/support/elections/$ELECTION_ID/public/stats" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Workgroup

### `GET /workgroup` (supports `filter`, paging, and `detail=user,category`)

```sh
curl -sS "$API/workgroup?filter=Team&page=1&items=50&detail=user,category" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /workgroup/:workgroupId`

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/workgroup/$WORKGROUP_ID?detail=user,category" -H "Authorization: Bearer $TOKEN"
```

### `POST /workgroup` (organization admin or system admin)

System admins can specify `organizationId` explicitly; org admins typically omit it and use their own org context.

```sh
curl -sS "$API/workgroup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Workgroup A","description":"Example","organizationId":"org_000"}'
```

### `PUT /workgroup/:workgroupId`

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/workgroup/$WORKGROUP_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated description"}'
```

### `DELETE /workgroup/:workgroupId`

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/workgroup/$WORKGROUP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `PUT /workgroup/:workgroupId/user/:userId` (add user to workgroup)

```sh
WORKGROUP_ID="workgroup_000"
USER_ID="user_000"
curl -sS "$API/workgroup/$WORKGROUP_ID/user/$USER_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /workgroup/:workgroupId/user/:userId` (remove user from workgroup)

```sh
WORKGROUP_ID="workgroup_000"
USER_ID="user_000"
curl -sS "$API/workgroup/$WORKGROUP_ID/user/$USER_ID" \
  -X DELETE \
  -H "Authorization: Bearer $TOKEN"
```

### `PUT /workgroup/:workgroupId/bulkuseradd` (bulk add users)

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/workgroup/$WORKGROUP_ID/bulkuseradd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":["user_001","user_002"]}'
```

### `PUT /workgroup/:workgroupId/bulkuserdel` (bulk remove users)

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/workgroup/$WORKGROUP_ID/bulkuserdel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":["user_001","user_002"]}'
```

---

## Group (Election Audience Groups)

Groups are collections of users used to select election voters (separate from workgroups).

### `GET /group`

```sh
curl -sS "$API/group?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /group/:groupId`

```sh
GROUP_ID="group_000"
curl -sS "$API/group/$GROUP_ID?detail=user,category" -H "Authorization: Bearer $TOKEN"
```

### `POST /group`

```sh
curl -sS "$API/group" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Voters","description":"Audience","organizationId":"org_000"}'
```

### `PUT /group/:groupId`

```sh
GROUP_ID="group_000"
curl -sS "$API/group/$GROUP_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /group/:groupId`

```sh
GROUP_ID="group_000"
curl -sS "$API/group/$GROUP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `PUT /group/:groupId/user/:userId` (add user to group)

```sh
GROUP_ID="group_000"
USER_ID="user_000"
curl -sS "$API/group/$GROUP_ID/user/$USER_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

### `DELETE /group/:groupId/user/:userId` (remove user from group)

```sh
GROUP_ID="group_000"
USER_ID="user_000"
curl -sS "$API/group/$GROUP_ID/user/$USER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `PUT /group/:groupId/bulkuseradd` (bulk add users)

```sh
GROUP_ID="group_000"
curl -sS "$API/group/$GROUP_ID/bulkuseradd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":["user_001","user_002"]}'
```

### `PUT /group/:groupId/bulkuserdel` (bulk remove users)

```sh
GROUP_ID="group_000"
curl -sS "$API/group/$GROUP_ID/bulkuserdel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":["user_001","user_002"]}'
```

---

## User

### `GET /user` (list users)

```sh
curl -sS "$API/user?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /user/:userId`

```sh
USER_ID="user_000"
curl -sS "$API/user/$USER_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /user` (add user)

```sh
curl -sS "$API/user" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","firstName":"A","lastName":"User","password":"REPLACE_ME","organizationId":"org_000"}'
```

### `PUT /user/:userId` (update user)

```sh
USER_ID="user_000"
curl -sS "$API/user/$USER_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationAdmin":true}'
```

### `DELETE /user/:userId` (delete user)

```sh
USER_ID="user_000"
curl -sS "$API/user/$USER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `DELETE /user/:userId/reassign/:ownerId` (delete + reassign ownership)

```sh
USER_ID="user_000"
OWNER_ID="user_999"
curl -sS "$API/user/$USER_ID/reassign/$OWNER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `GET /user/:userId/ownership/preview` (inspect owner transfer impact)

```sh
USER_ID="user_000"
OWNER_ID="user_999"
curl -sS "$API/user/$USER_ID/ownership/preview?ownerId=$OWNER_ID&includeLinked=true&resources=lists,elections" \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /user/:userId/ownership/transfer` (apply owner transfer)

```sh
USER_ID="user_000"
OWNER_ID="user_999"
curl -sS "$API/user/$USER_ID/ownership/transfer" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"'"$OWNER_ID"'","includeLinked":true,"resources":["lists","elections"]}'
```

### Friendships

#### `GET /user/friend` (friends for current user)

```sh
curl -sS "$API/user/friend" -H "Authorization: Bearer $TOKEN"
```

#### `GET /user/:userId/friend` (friends for specific user)

```sh
USER_ID="user_000"
curl -sS "$API/user/$USER_ID/friend" -H "Authorization: Bearer $TOKEN"
```

#### `POST /user/request` (send friend request using body)

```sh
curl -sS "$API/user/request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"friendId":"user_123"}'
```

#### `POST /user/request/:friendId` (send friend request using path)

```sh
FRIEND_ID="user_123"
curl -sS "$API/user/request/$FRIEND_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

#### `PUT /user/:userId/friend/:friendId` (add friend)

```sh
USER_ID="user_000"
FRIEND_ID="user_123"
curl -sS "$API/user/$USER_ID/friend/$FRIEND_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `POST /user/accept/:tokenId` (accept friend request)

```sh
TOKEN_ID="wotlwedu_000"
curl -sS "$API/user/accept/$TOKEN_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /user/friend/:friendId` (delete relationship)

```sh
FRIEND_ID="user_123"
curl -sS "$API/user/friend/$FRIEND_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /user/relationship/:relationshipId` (delete relationship by id)

```sh
REL_ID="rel_000"
curl -sS "$API/user/relationship/$REL_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `PUT /user/block/:blockUser` (block user)

```sh
BLOCK_USER_ID="user_123"
curl -sS "$API/user/block/$BLOCK_USER_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

---

## Role

### `GET /role`

```sh
curl -sS "$API/role?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /role/:roleId`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /role`

```sh
curl -sS "$API/role" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Role","description":"Example"}'
```

### `PUT /role/:roleId`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /role/:roleId`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Manage capabilities on role

#### `PUT /role/:roleId/cap/:capabilityId`

```sh
ROLE_ID="role_000"
CAP_ID="capa_000"
curl -sS "$API/role/$ROLE_ID/cap/$CAP_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /role/:roleId/cap/:capabilityId`

```sh
ROLE_ID="role_000"
CAP_ID="capa_000"
curl -sS "$API/role/$ROLE_ID/cap/$CAP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `PUT /role/:roleId/bulkcapadd`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkcapadd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capabilities":["capability.view.admin","item.add.owner"]}'
```

#### `PUT /role/:roleId/bulkcapdel`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkcapdel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capabilities":["capability.view.admin"]}'
```

### Manage users on role

#### `PUT /role/:roleId/user/:userId`

```sh
ROLE_ID="role_000"
USER_ID="user_000"
curl -sS "$API/role/$ROLE_ID/user/$USER_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /role/:roleId/user/:userId`

```sh
ROLE_ID="role_000"
USER_ID="user_000"
curl -sS "$API/role/$ROLE_ID/user/$USER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `PUT /role/:roleId/bulkuseradd`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkuseradd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":["user_001","user_002"]}'
```

#### `PUT /role/:roleId/bulkuserdel`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkuserdel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users":["user_001","user_002"]}'
```

---

## Capability

### `GET /capability`

```sh
curl -sS "$API/capability?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /capability/:capId`

```sh
CAP_ID="capa_000"
curl -sS "$API/capability/$CAP_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /capability`

```sh
curl -sS "$API/capability" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"item.view.owner","comment":"Example"}'
```

### `PUT /capability/:capId`

```sh
CAP_ID="capa_000"
curl -sS "$API/capability/$CAP_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"Updated"}'
```

### `DELETE /capability/:capId`

```sh
CAP_ID="capa_000"
curl -sS "$API/capability/$CAP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Category

### `GET /category`

```sh
curl -sS "$API/category?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /category/:categoryId`

```sh
CATEGORY_ID="cat_000"
curl -sS "$API/category/$CATEGORY_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /category`

```sh
curl -sS "$API/category" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Food","object":"item","creator":"user_000"}'
```

### `PUT /category/:categoryId`

```sh
CATEGORY_ID="cat_000"
curl -sS "$API/category/$CATEGORY_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated"}'
```

### `DELETE /category/:categoryId`

```sh
CATEGORY_ID="cat_000"
curl -sS "$API/category/$CATEGORY_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Item

### `GET /item` (list; supports `filter`, paging; optionally `workgroupId`)

```sh
curl -sS "$API/item?filter=Pizza&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/item?workgroupId=$WORKGROUP_ID&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /item/:itemId`

```sh
ITEM_ID="item_000"
curl -sS "$API/item/$ITEM_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /item/:itemId/notif/:notificationId` (bypass via notification)

```sh
ITEM_ID="item_000"
NOTIF_ID="notif_000"
curl -sS "$API/item/$ITEM_ID/notif/$NOTIF_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /item` (create; optionally for a workgroup)

```sh
curl -sS "$API/item" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Item","description":"Example","url":"","location":""}'
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/item" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG Item","description":"Example","workgroupId":"workgroup_000"}'
```

### `PUT /item/:itemId` (update; can set `workgroupId` if authorized)

```sh
ITEM_ID="item_000"
curl -sS "$API/item/$ITEM_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /item/:itemId`

```sh
ITEM_ID="item_000"
curl -sS "$API/item/$ITEM_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Sharing

#### `POST /item/share/:itemId/recipient/:recipient`

```sh
ITEM_ID="item_000"
RECIPIENT_USER_ID="user_123"
curl -sS "$API/item/share/$ITEM_ID/recipient/$RECIPIENT_USER_ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN"
```

#### `POST /item/accept/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/item/accept/$NOTIF_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

---

## Image

### `GET /image` (list; optionally `workgroupId`)

```sh
curl -sS "$API/image?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/image?workgroupId=$WORKGROUP_ID&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /image/:imageId`

```sh
IMAGE_ID="image_000"
curl -sS "$API/image/$IMAGE_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /image/:imageId/notif/:notificationId` (bypass via notification)

```sh
IMAGE_ID="image_000"
NOTIF_ID="notif_000"
curl -sS "$API/image/$IMAGE_ID/notif/$NOTIF_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /image` (create image record; optionally for a workgroup)

```sh
curl -sS "$API/image" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Image","description":"Example"}'
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/image" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG Image","description":"Example","workgroupId":"workgroup_000"}'
```

### `POST /image/file/:imageId` (upload image bytes)

This is a multipart upload. The field name must be `imageUpload`.

```sh
IMAGE_ID="image_000"
curl -sS "$API/image/file/$IMAGE_ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "fileextension=jpg" \
  -F "imageUpload=@/path/to/image.jpg"
```

### `PUT /image/:imageId` (update metadata; can set `workgroupId` if authorized)

```sh
IMAGE_ID="image_000"
curl -sS "$API/image/$IMAGE_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /image/file/:imageId` (delete stored file)

```sh
IMAGE_ID="image_000"
curl -sS "$API/image/file/$IMAGE_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `DELETE /image/:imageId` (delete record)

```sh
IMAGE_ID="image_000"
curl -sS "$API/image/$IMAGE_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Sharing

#### `POST /image/share/:imageId/recipient/:recipient`

```sh
IMAGE_ID="image_000"
RECIPIENT_USER_ID="user_123"
curl -sS "$API/image/share/$IMAGE_ID/recipient/$RECIPIENT_USER_ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN"
```

#### `POST /image/accept/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/image/accept/$NOTIF_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

---

## List

### `GET /list` (list; optionally `workgroupId`)

```sh
curl -sS "$API/list?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/list?workgroupId=$WORKGROUP_ID&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /list/:listId` (supports `detail=item,category,image`)

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID?detail=item,category,image" -H "Authorization: Bearer $TOKEN"
```

### `GET /list/:listId/notif/:notificationId` (bypass via notification)

```sh
LIST_ID="list_000"
NOTIF_ID="notif_000"
curl -sS "$API/list/$LIST_ID/notif/$NOTIF_ID?detail=item,category,image" -H "Authorization: Bearer $TOKEN"
```

### `POST /list` (create; optionally for a workgroup)

```sh
curl -sS "$API/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example List","description":"Example"}'
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG List","description":"Example","workgroupId":"workgroup_000"}'
```

### `PUT /list/:listId` (update; can set `workgroupId` if authorized)

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /list/:listId`

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Manage list items

#### `PUT /list/:listId/item/:itemId` (add item)

```sh
LIST_ID="list_000"
ITEM_ID="item_000"
curl -sS "$API/list/$LIST_ID/item/$ITEM_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /list/:listId/item/:itemId` (remove item)

```sh
LIST_ID="list_000"
ITEM_ID="item_000"
curl -sS "$API/list/$LIST_ID/item/$ITEM_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `POST /list/:listId/bulkitemadd`

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID/bulkitemadd" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":["item_001","item_002"]}'
```

#### `POST /list/:listId/bulkitemdel`

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID/bulkitemdel" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":["item_001","item_002"]}'
```

### Sharing

#### `POST /list/share/:listId/recipient/:recipient`

```sh
LIST_ID="list_000"
RECIPIENT_USER_ID="user_123"
curl -sS "$API/list/share/$LIST_ID/recipient/$RECIPIENT_USER_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

#### `POST /list/accept/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/list/accept/$NOTIF_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

---

## Tutorial

### `POST /tutorial/poll/start`

```sh
curl -sS "$API/tutorial/poll/start" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### `GET /tutorial/poll`

```sh
curl -sS "$API/tutorial/poll" -H "Authorization: Bearer $TOKEN"
```

### `POST /tutorial/poll/skip`

```sh
curl -sS "$API/tutorial/poll/skip" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### `POST /tutorial/poll/enable`

```sh
curl -sS "$API/tutorial/poll/enable" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```sh
curl -sS "$API/tutorial/poll/enable" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"restart":true}'
```

### `POST /support/users/:userId/tutorial/poll/enable`

```sh
USER_ID="user_000"
curl -sS "$API/support/users/$USER_ID/tutorial/poll/enable" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Election

### `GET /election` (list; optionally `workgroupId`; supports `detail=list,group,category,image`)

```sh
curl -sS "$API/election?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/election?workgroupId=$WORKGROUP_ID&page=1&items=50&detail=list,group" -H "Authorization: Bearer $TOKEN"
```

### `GET /election/:electionId`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID?detail=list,group,category,image" -H "Authorization: Bearer $TOKEN"
```

### `POST /election` (create; optionally for a workgroup)

```sh
curl -sS "$API/election" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Election","description":"Example","listId":"list_000","groupId":"group_000"}'
```

```sh
WORKGROUP_ID="workgroup_000"
curl -sS "$API/election" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG Election","description":"Example","workgroupId":"workgroup_000","listId":"list_000","groupId":"group_000"}'
```

### `PUT /election/:electionId` (update; can set `workgroupId` if authorized)

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /election/:electionId`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `POST /election/:electionId/start`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID/start" -X POST -H "Authorization: Bearer $TOKEN"
```

### `POST /election/:electionId/stop`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID/stop" -X POST -H "Authorization: Bearer $TOKEN"
```

### `GET /election/:electionId/stats`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID/stats" -H "Authorization: Bearer $TOKEN"
```

### `GET /election/:electionId/participation`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID/participation" -H "Authorization: Bearer $TOKEN"
```

### `POST /election/:electionId/remind`

```sh
ELECTION_ID="election_000"
curl -sS "$API/election/$ELECTION_ID/remind" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"states":["not_started","in_progress"],"message":"Please finish your vote today"}'
```

---

## Vote

### `GET /vote` (list votes)

```sh
curl -sS "$API/vote?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /vote/:voteId`

```sh
VOTE_ID="vote_000"
curl -sS "$API/vote/$VOTE_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /vote/election/:electionId` (all votes for election)

```sh
ELECTION_ID="election_000"
curl -sS "$API/vote/election/$ELECTION_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /vote/:electionId/next` (next available vote for election)

```sh
ELECTION_ID="election_000"
curl -sS "$API/vote/$ELECTION_ID/next" -H "Authorization: Bearer $TOKEN"
```

### `GET /vote/next/all` (all next votes)

```sh
curl -sS "$API/vote/next/all" -H "Authorization: Bearer $TOKEN"
```

### `POST /vote` (add vote)

```sh
curl -sS "$API/vote" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"electionId":"election_000","itemId":"item_000","userId":"user_000"}'
```

### `PUT /vote/:voteId` (update vote)

```sh
VOTE_ID="vote_000"
curl -sS "$API/vote/$VOTE_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statusId":"status_approved"}'
```

---

## Cast (Vote Decision)

### `POST /cast/:voteId/decision` (cast a vote)

```sh
VOTE_ID="vote_000"
curl -sS "$API/cast/$VOTE_ID/decision" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"Approved"}'
```

---

## Notification

### `GET /notification` (list notifications)

```sh
curl -sS "$API/notification?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

Response data includes `notifications`, `page`, `total`, and `itemsPerPage`, ordered by newest first.

### `GET /notification/unreadcount`

```sh
curl -sS "$API/notification/unreadcount" -H "Authorization: Bearer $TOKEN"
```

Response data includes `unread`.

### `GET /notification/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/notification/$NOTIF_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /notification` (create notification)

```sh
curl -sS "$API/notification" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_123","senderId":"user_456","statusId":100,"type":109,"objectId":"item_000","text":"Example"}'
```

### `PUT /notification/:notificationId` (update notification)

```sh
NOTIF_ID="notif_000"
curl -sS "$API/notification/$NOTIF_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Updated","objectId":"item_001"}'
```

### `PUT /notification/status/:notificationId/:statusId` (set status)

```sh
NOTIF_ID="notif_000"
STATUS_ID="101"
curl -sS "$API/notification/status/$NOTIF_ID/$STATUS_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

### `DELETE /notification/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/notification/$NOTIF_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Preference

### `GET /preference` (list)

```sh
curl -sS "$API/preference" -H "Authorization: Bearer $TOKEN"
```

### `GET /preference/:preferenceName`

```sh
curl -sS "$API/preference/ui.theme" -H "Authorization: Bearer $TOKEN"
```

### `POST /preference`

```sh
curl -sS "$API/preference" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ui.theme","value":"light","comment":"Example"}'
```

### `PUT /preference/:preferenceName`

```sh
curl -sS "$API/preference/ui.theme" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"dark"}'
```

### `DELETE /preference/:preferenceName`

```sh
curl -sS "$API/preference/ui.theme" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Helper

### `GET /helper/status` (all status names)

```sh
curl -sS "$API/helper/status" -H "Authorization: Bearer $TOKEN"
```

### `GET /helper/status/object` (all objects)

```sh
curl -sS "$API/helper/status/object" -H "Authorization: Bearer $TOKEN"
```

### `GET /helper/status/object/:objectName`

```sh
curl -sS "$API/helper/status/object/election" -H "Authorization: Bearer $TOKEN"
```

### `GET /helper/status/id/:statusName`

```sh
curl -sS "$API/helper/status/id/In%20Progress" -H "Authorization: Bearer $TOKEN"
```

---

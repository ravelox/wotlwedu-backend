# Wotlwedu Backend API: curl Examples

This document provides copy/paste `curl` examples for every HTTP endpoint mounted by `wotlwedu-backend` (`app.js`).

## Conventions

Set these once in your shell:

```sh
ORIGIN="http://localhost:9876"
API="/v1"
TOKEN="REPLACE_ME"   # Bearer token from /v1/login
```

Authenticated requests use:

```sh
curl -H "Authorization: Bearer $TOKEN" ...
```

Notes:
- Unless stated otherwise, endpoints require authentication (the server mounts most routers behind `Security.checkAuthentication` in `app.js`).
- `StatusResponse` payloads look like: `{ "status": 200, "message": "OK", "data": { ... } }`.
- **Space scoping** (items/pictures/lists/polls): admins can target a space by passing `spaceId` in the JSON body (create/update) or query string (list). The organization is implied by the space.
- **Category ownership**: `categoryId` must reference a category created by the authenticated user.
- **Collapsible category grouping**: collection endpoints for category-enabled resources support `?collapsible=true`, returning an additional grouped `menu` field.

---

## Static (No Auth)

### `GET /favicon.ico`

```sh
curl -i "$ORIGIN/favicon.ico"
```

### `GET /docs` (static docs directory)

```sh
curl -sS "$ORIGIN/docs/openapi.yaml" | head
```

```sh
curl -sS "$ORIGIN/docs/index.html" | head
```

---

## Ping

### `GET /v1/ping`

```sh
curl -sS "$API/ping" -H "Authorization: Bearer $TOKEN"
```

---

## Login

### `POST /v1/login` (get authToken + refreshToken)

```sh
curl -sS "$API/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"root@localhost.localdomain","password":"REPLACE_ME"}'
```

### `POST /v1/login/refresh` (refresh authToken)

```sh
curl -sS "$API/login/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"REPLACE_ME"}'
```

### `POST /v1/login/resetreq` (request password reset email)

```sh
curl -sS "$API/login/resetreq" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### `PUT /v1/login/password/:userid` (complete password reset)

```sh
USER_ID="user_000"
curl -sS "$API/login/password/$USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"token":"REPLACE_ME","password":"NewPasswordHere"}'
```

### `POST /v1/login/2fa` (enable 2FA; requires auth)

```sh
curl -sS "$API/login/2fa" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/login/gentoken` (generate 2FA verification token; requires auth)

```sh
curl -sS "$API/login/gentoken" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/login/testtoken` (system-admin testing token mint; requires auth)

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

### `POST /v1/login/testtoken/revoke` (revoke a previously minted test token; requires auth)

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

### `POST /v1/login/verify2fa` (verify 2FA)

This route is mounted with `Security.bypassCheck` and can be called without an Authorization header.

```sh
curl -sS "$API/login/verify2fa" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_000","verificationToken":"REPLACE_ME","authToken":"123456"}'
```

---

## Register

### `POST /v1/register` (request registration)

```sh
curl -sS "$API/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"new.user@example.com","firstName":"New","lastName":"User","password":"REPLACE_ME"}'
```

### `POST /v1/register/confirm/:tokenId` (confirm registration)

```sh
TOKEN_ID="wotlwedu_000"
curl -sS "$API/register/confirm/$TOKEN_ID" -X POST
```

---

## Organization

### `GET /v1/organization`

```sh
curl -sS "$API/organization" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/organization/:organizationId`

```sh
ORG_ID="org_000"
curl -sS "$API/organization/$ORG_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/organization`

```sh
curl -sS "$API/organization" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Org","description":"Example"}'
```

### `PUT /v1/organization/:organizationId`

```sh
ORG_ID="org_000"
curl -sS "$API/organization/$ORG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed Org"}'
```

### `DELETE /v1/organization/:organizationId`

```sh
ORG_ID="org_000"
curl -sS "$API/organization/$ORG_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

## Support

### `GET /v1/support/auth/overview`

```sh
curl -sS "$API/support/auth/overview?organizationId=org_000&days=7" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/auth/audit`

```sh
curl -sS "$API/support/auth/audit?organizationId=org_000&outcome=failure&items=25" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/publicpoll/overview`

```sh
curl -sS "$API/support/publicpoll/overview?organizationId=org_000&days=7&eventType=public_poll_reported" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/publicpoll/audit`

```sh
curl -sS "$API/support/publicpoll/audit?organizationId=org_000&items=25&electionId=election_000" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/people/:userId/signin-method`

```sh
USER_ID="user_000"
curl -sS "$API/support/people/$USER_ID/signin-method" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/people/:userId/authaudit`

```sh
USER_ID="user_000"
curl -sS "$API/support/people/$USER_ID/authaudit?items=25" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/organizations/:organizationId/invite`

```sh
ORG_ID="org_000"
curl -sS "$API/support/organizations/$ORG_ID/invite?status=pending" \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/support/organizations/:organizationId/invite`

```sh
ORG_ID="org_000"
curl -sS "$API/support/organizations/$ORG_ID/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com"}'
```

### `GET /v1/support/polls/public/trust`

```sh
curl -sS "$API/support/polls/public/trust" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/support/polls/:electionId/public/stats`

```sh
ELECTION_ID="election_000"
curl -sS "$API/support/polls/$ELECTION_ID/public/stats" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Workgroup

### `GET /v1/space` (supports `filter`, paging, and `detail=user,category`)

```sh
curl -sS "$API/space?filter=Team&page=1&items=50&detail=user,category" \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/space/:spaceId`

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/space/$WORKGROUP_ID?detail=user,category" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/space` (organization admin or system admin)

System admins can specify `organizationId` explicitly; org admins typically omit it and use their own org context.

```sh
curl -sS "$API/space" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Workgroup A","description":"Example","organizationId":"org_000"}'
```

### `PUT /v1/space/:spaceId`

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/space/$WORKGROUP_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated description"}'
```

### `DELETE /v1/space/:spaceId`

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/space/$WORKGROUP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `PUT /v1/space/:spaceId/person/:userId` (add user to space)

```sh
WORKGROUP_ID="space_000"
USER_ID="user_000"
curl -sS "$API/space/$WORKGROUP_ID/person/$USER_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN"
```

### `DELETE /v1/space/:spaceId/person/:userId` (remove user from space)

```sh
WORKGROUP_ID="space_000"
USER_ID="user_000"
curl -sS "$API/space/$WORKGROUP_ID/person/$USER_ID" \
  -X DELETE \
  -H "Authorization: Bearer $TOKEN"
```

### `PUT /v1/space/:spaceId/bulkpersonadd` (bulk add people)

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/space/$WORKGROUP_ID/bulkpersonadd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personList":["user_001","user_002"]}'
```

### `PUT /v1/space/:spaceId/bulkpersondel` (bulk remove people)

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/space/$WORKGROUP_ID/bulkpersondel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personList":["user_001","user_002"]}'
```

---

## Group (Election Audience Groups)

Circles are collections of people used to select poll voters (separate from spaces).

### `GET /v1/circle`

```sh
curl -sS "$API/circle?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/circle/:groupId`

```sh
GROUP_ID="group_000"
curl -sS "$API/circle/$GROUP_ID?detail=user,category" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/circle`

```sh
curl -sS "$API/circle" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Voters","description":"Audience","organizationId":"org_000"}'
```

### `PUT /v1/circle/:groupId`

```sh
GROUP_ID="group_000"
curl -sS "$API/circle/$GROUP_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /v1/circle/:groupId`

```sh
GROUP_ID="group_000"
curl -sS "$API/circle/$GROUP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `PUT /v1/circle/:groupId/person/:userId` (add user to group)

```sh
GROUP_ID="group_000"
USER_ID="user_000"
curl -sS "$API/circle/$GROUP_ID/person/$USER_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

### `DELETE /v1/circle/:groupId/person/:userId` (remove user from group)

```sh
GROUP_ID="group_000"
USER_ID="user_000"
curl -sS "$API/circle/$GROUP_ID/person/$USER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `PUT /v1/circle/:groupId/bulkpersonadd` (bulk add people)

```sh
GROUP_ID="group_000"
curl -sS "$API/circle/$GROUP_ID/bulkpersonadd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personList":["user_001","user_002"]}'
```

### `PUT /v1/circle/:groupId/bulkpersondel` (bulk remove people)

```sh
GROUP_ID="group_000"
curl -sS "$API/circle/$GROUP_ID/bulkpersondel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personList":["user_001","user_002"]}'
```

---

## User

### `GET /v1/person` (list users)

```sh
curl -sS "$API/person?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/person/:userId`

```sh
USER_ID="user_000"
curl -sS "$API/person/$USER_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/person` (add user)

```sh
curl -sS "$API/person" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","firstName":"A","lastName":"User","password":"REPLACE_ME","organizationId":"org_000"}'
```

### `PUT /v1/person/:userId` (update user)

```sh
USER_ID="user_000"
curl -sS "$API/person/$USER_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationAdmin":true}'
```

### `DELETE /v1/person/:userId` (delete user)

```sh
USER_ID="user_000"
curl -sS "$API/person/$USER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `DELETE /v1/person/:userId/reassign/:ownerId` (delete + reassign ownership)

```sh
USER_ID="user_000"
OWNER_ID="user_999"
curl -sS "$API/person/$USER_ID/reassign/$OWNER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/person/:userId/ownership/preview` (inspect owner transfer impact)

```sh
USER_ID="user_000"
OWNER_ID="user_999"
curl -sS "$API/person/$USER_ID/ownership/preview?ownerId=$OWNER_ID&includeLinked=true&resources=lists,polls" \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/person/:userId/ownership/transfer` (apply owner transfer)

```sh
USER_ID="user_000"
OWNER_ID="user_999"
curl -sS "$API/person/$USER_ID/ownership/transfer" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"'"$OWNER_ID"'","includeLinked":true,"resources":["lists","polls"]}'
```

### Friendships

#### `GET /v1/person/friend` (friends for current user)

```sh
curl -sS "$API/person/friend" -H "Authorization: Bearer $TOKEN"
```

#### `GET /v1/person/:userId/friend` (friends for specific user)

```sh
USER_ID="user_000"
curl -sS "$API/person/$USER_ID/friend" -H "Authorization: Bearer $TOKEN"
```

#### `POST /v1/person/request` (send friend request using body)

```sh
curl -sS "$API/person/request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"friendId":"user_123"}'
```

#### `POST /v1/person/request/:friendId` (send friend request using path)

```sh
FRIEND_ID="user_123"
curl -sS "$API/person/request/$FRIEND_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

#### `PUT /v1/person/:userId/friend/:friendId` (add friend)

```sh
USER_ID="user_000"
FRIEND_ID="user_123"
curl -sS "$API/person/$USER_ID/friend/$FRIEND_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `POST /v1/person/accept/:tokenId` (accept friend request)

```sh
TOKEN_ID="wotlwedu_000"
curl -sS "$API/person/accept/$TOKEN_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /v1/person/friend/:friendId` (delete relationship)

```sh
FRIEND_ID="user_123"
curl -sS "$API/person/friend/$FRIEND_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /v1/person/relationship/:relationshipId` (delete relationship by id)

```sh
REL_ID="rel_000"
curl -sS "$API/person/relationship/$REL_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `PUT /v1/person/block/:blockUser` (block user)

```sh
BLOCK_USER_ID="user_123"
curl -sS "$API/person/block/$BLOCK_USER_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

---

## Role

### `GET /v1/role`

```sh
curl -sS "$API/role?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/role/:roleId`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/role`

```sh
curl -sS "$API/role" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Role","description":"Example"}'
```

### `PUT /v1/role/:roleId`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /v1/role/:roleId`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Manage capabilities on role

#### `PUT /v1/role/:roleId/cap/:capabilityId`

```sh
ROLE_ID="role_000"
CAP_ID="capa_000"
curl -sS "$API/role/$ROLE_ID/cap/$CAP_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /v1/role/:roleId/cap/:capabilityId`

```sh
ROLE_ID="role_000"
CAP_ID="capa_000"
curl -sS "$API/role/$ROLE_ID/cap/$CAP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `PUT /v1/role/:roleId/bulkcapadd`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkcapadd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capabilities":["capability.view.admin","item.add.owner"]}'
```

#### `PUT /v1/role/:roleId/bulkcapdel`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkcapdel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capabilities":["capability.view.admin"]}'
```

### Manage users on role

#### `PUT /v1/role/:roleId/person/:userId`

```sh
ROLE_ID="role_000"
USER_ID="user_000"
curl -sS "$API/role/$ROLE_ID/person/$USER_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /v1/role/:roleId/person/:userId`

```sh
ROLE_ID="role_000"
USER_ID="user_000"
curl -sS "$API/role/$ROLE_ID/person/$USER_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `PUT /v1/role/:roleId/bulkpersonadd`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkpersonadd" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personList":["user_001","user_002"]}'
```

#### `PUT /v1/role/:roleId/bulkpersondel`

```sh
ROLE_ID="role_000"
curl -sS "$API/role/$ROLE_ID/bulkpersondel" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personList":["user_001","user_002"]}'
```

---

## Capability

### `GET /v1/capability`

```sh
curl -sS "$API/capability?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/capability/:capId`

```sh
CAP_ID="capa_000"
curl -sS "$API/capability/$CAP_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/capability`

```sh
curl -sS "$API/capability" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"item.view.owner","comment":"Example"}'
```

### `PUT /v1/capability/:capId`

```sh
CAP_ID="capa_000"
curl -sS "$API/capability/$CAP_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"Updated"}'
```

### `DELETE /v1/capability/:capId`

```sh
CAP_ID="capa_000"
curl -sS "$API/capability/$CAP_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Category

### `GET /v1/category`

```sh
curl -sS "$API/category?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/category/:categoryId`

```sh
CATEGORY_ID="cat_000"
curl -sS "$API/category/$CATEGORY_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/category`

```sh
curl -sS "$API/category" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Food","object":"item","creator":"user_000"}'
```

### `PUT /v1/category/:categoryId`

```sh
CATEGORY_ID="cat_000"
curl -sS "$API/category/$CATEGORY_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated"}'
```

### `DELETE /v1/category/:categoryId`

```sh
CATEGORY_ID="cat_000"
curl -sS "$API/category/$CATEGORY_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Item

### `GET /v1/item` (list; supports `filter`, paging; optionally `spaceId`)

```sh
curl -sS "$API/item?filter=Pizza&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/item?spaceId=$WORKGROUP_ID&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/item/:itemId`

```sh
ITEM_ID="item_000"
curl -sS "$API/item/$ITEM_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/item/:itemId/notif/:notificationId` (bypass via notification)

```sh
ITEM_ID="item_000"
NOTIF_ID="notif_000"
curl -sS "$API/item/$ITEM_ID/notif/$NOTIF_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/item` (create; optionally for a space)

```sh
curl -sS "$API/item" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Item","description":"Example","url":"","location":""}'
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/item" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG Item","description":"Example","spaceId":"space_000"}'
```

### `PUT /v1/item/:itemId` (update; can set `spaceId` if authorized)

```sh
ITEM_ID="item_000"
curl -sS "$API/item/$ITEM_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /v1/item/:itemId`

```sh
ITEM_ID="item_000"
curl -sS "$API/item/$ITEM_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Sharing

#### `POST /v1/item/share/:itemId/recipient/:recipient`

```sh
ITEM_ID="item_000"
RECIPIENT_USER_ID="user_123"
curl -sS "$API/item/share/$ITEM_ID/recipient/$RECIPIENT_USER_ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN"
```

#### `POST /v1/item/accept/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/item/accept/$NOTIF_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

---

## Image

### `GET /v1/picture` (list; optionally `spaceId`)

```sh
curl -sS "$API/picture?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/picture?spaceId=$WORKGROUP_ID&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/picture/:imageId`

```sh
IMAGE_ID="image_000"
curl -sS "$API/picture/$IMAGE_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/picture/:imageId/notif/:notificationId` (bypass via notification)

```sh
IMAGE_ID="image_000"
NOTIF_ID="notif_000"
curl -sS "$API/picture/$IMAGE_ID/notif/$NOTIF_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/picture` (create image record; optionally for a space)

```sh
curl -sS "$API/picture" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Image","description":"Example"}'
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/picture" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG Image","description":"Example","spaceId":"space_000"}'
```

### `POST /v1/picture/file/:imageId` (upload image bytes)

This is a multipart upload. The field name must be `imageUpload`.

```sh
IMAGE_ID="image_000"
curl -sS "$API/picture/file/$IMAGE_ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "fileextension=jpg" \
  -F "imageUpload=@/path/to/picture.jpg"
```

### `PUT /v1/picture/:imageId` (update metadata; can set `spaceId` if authorized)

```sh
IMAGE_ID="image_000"
curl -sS "$API/picture/$IMAGE_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /v1/picture/file/:imageId` (delete stored file)

```sh
IMAGE_ID="image_000"
curl -sS "$API/picture/file/$IMAGE_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `DELETE /v1/picture/:imageId` (delete record)

```sh
IMAGE_ID="image_000"
curl -sS "$API/picture/$IMAGE_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Sharing

#### `POST /v1/picture/share/:imageId/recipient/:recipient`

```sh
IMAGE_ID="image_000"
RECIPIENT_USER_ID="user_123"
curl -sS "$API/picture/share/$IMAGE_ID/recipient/$RECIPIENT_USER_ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN"
```

#### `POST /v1/picture/accept/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/picture/accept/$NOTIF_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

---

## List

### `GET /v1/list` (list; optionally `spaceId`)

```sh
curl -sS "$API/list?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/list?spaceId=$WORKGROUP_ID&page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/list/:listId` (supports `detail=item,category,image`)

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID?detail=item,category,image" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/list/:listId/notif/:notificationId` (bypass via notification)

```sh
LIST_ID="list_000"
NOTIF_ID="notif_000"
curl -sS "$API/list/$LIST_ID/notif/$NOTIF_ID?detail=item,category,image" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/list` (create; optionally for a space)

```sh
curl -sS "$API/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example List","description":"Example"}'
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG List","description":"Example","spaceId":"space_000"}'
```

### `PUT /v1/list/:listId` (update; can set `spaceId` if authorized)

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /v1/list/:listId`

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### Manage list items

#### `PUT /v1/list/:listId/item/:itemId` (add item)

```sh
LIST_ID="list_000"
ITEM_ID="item_000"
curl -sS "$API/list/$LIST_ID/item/$ITEM_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

#### `DELETE /v1/list/:listId/item/:itemId` (remove item)

```sh
LIST_ID="list_000"
ITEM_ID="item_000"
curl -sS "$API/list/$LIST_ID/item/$ITEM_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

#### `POST /v1/list/:listId/bulkitemadd`

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID/bulkitemadd" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":["item_001","item_002"]}'
```

#### `POST /v1/list/:listId/bulkitemdel`

```sh
LIST_ID="list_000"
curl -sS "$API/list/$LIST_ID/bulkitemdel" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":["item_001","item_002"]}'
```

### Sharing

#### `POST /v1/list/share/:listId/recipient/:recipient`

```sh
LIST_ID="list_000"
RECIPIENT_USER_ID="user_123"
curl -sS "$API/list/share/$LIST_ID/recipient/$RECIPIENT_USER_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

#### `POST /v1/list/accept/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/list/accept/$NOTIF_ID" -X POST -H "Authorization: Bearer $TOKEN"
```

---

## Tutorial

### `POST /v1/tutorial/poll/start`

```sh
curl -sS "$API/tutorial/poll/start" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### `GET /v1/tutorial/poll`

```sh
curl -sS "$API/tutorial/poll" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/tutorial/poll/skip`

```sh
curl -sS "$API/tutorial/poll/skip" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### `POST /v1/tutorial/poll/enable`

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

### `POST /v1/support/people/:userId/tutorial/poll/enable`

```sh
USER_ID="user_000"
curl -sS "$API/support/people/$USER_ID/tutorial/poll/enable" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Election

### `GET /v1/poll` (list; optionally `spaceId`; supports `detail=list,group,category,image`)

```sh
curl -sS "$API/poll?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/poll?spaceId=$WORKGROUP_ID&page=1&items=50&detail=list,group" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/poll/:electionId`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID?detail=list,group,category,image" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/poll` (create; optionally for a space)

```sh
curl -sS "$API/poll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Election","description":"Example","listId":"list_000","groupId":"group_000"}'
```

```sh
WORKGROUP_ID="space_000"
curl -sS "$API/poll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"WG Election","description":"Example","spaceId":"space_000","listId":"list_000","groupId":"group_000"}'
```

### `PUT /v1/poll/:electionId` (update; can set `spaceId` if authorized)

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated"}'
```

### `DELETE /v1/poll/:electionId`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/poll/:electionId/start`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID/start" -X POST -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/poll/:electionId/stop`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID/stop" -X POST -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/poll/:electionId/stats`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID/stats" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/poll/:electionId/participation`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID/participation" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/poll/:electionId/remind`

```sh
ELECTION_ID="election_000"
curl -sS "$API/poll/$ELECTION_ID/remind" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"states":["not_started","in_progress"],"message":"Please finish your vote today"}'
```

---

## Vote

### `GET /v1/vote` (list votes)

```sh
curl -sS "$API/vote?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/vote/:voteId`

```sh
VOTE_ID="vote_000"
curl -sS "$API/vote/$VOTE_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/vote/poll/:electionId` (all votes for election)

```sh
ELECTION_ID="election_000"
curl -sS "$API/vote/poll/$ELECTION_ID" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/vote/:electionId/next` (next available vote for election)

```sh
ELECTION_ID="election_000"
curl -sS "$API/vote/$ELECTION_ID/next" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/vote/next/all` (all next votes)

```sh
curl -sS "$API/vote/next/all" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/vote` (add vote)

```sh
curl -sS "$API/vote" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"electionId":"election_000","itemId":"item_000","userId":"user_000"}'
```

### `PUT /v1/vote/:voteId` (update vote)

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

### `POST /v1/cast/:voteId/decision` (cast a vote)

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

### `GET /v1/notification` (list notifications)

```sh
curl -sS "$API/notification?page=1&items=50" -H "Authorization: Bearer $TOKEN"
```

Response data includes `notifications`, `page`, `total`, and `itemsPerPage`, ordered by newest first.

### `GET /v1/notification/unreadcount`

```sh
curl -sS "$API/notification/unreadcount" -H "Authorization: Bearer $TOKEN"
```

Response data includes `unread`.

### `GET /v1/notification/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/notification/$NOTIF_ID" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/notification` (create notification)

```sh
curl -sS "$API/notification" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_123","senderId":"user_456","statusId":100,"type":109,"objectId":"item_000","text":"Example"}'
```

### `PUT /v1/notification/:notificationId` (update notification)

```sh
NOTIF_ID="notif_000"
curl -sS "$API/notification/$NOTIF_ID" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Updated","objectId":"item_001"}'
```

### `PUT /v1/notification/status/:notificationId/:statusId` (set status)

```sh
NOTIF_ID="notif_000"
STATUS_ID="101"
curl -sS "$API/notification/status/$NOTIF_ID/$STATUS_ID" -X PUT -H "Authorization: Bearer $TOKEN"
```

### `DELETE /v1/notification/:notificationId`

```sh
NOTIF_ID="notif_000"
curl -sS "$API/notification/$NOTIF_ID" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Preference

### `GET /v1/preference` (list)

```sh
curl -sS "$API/preference" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/preference/:preferenceName`

```sh
curl -sS "$API/preference/ui.theme" -H "Authorization: Bearer $TOKEN"
```

### `POST /v1/preference`

```sh
curl -sS "$API/preference" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ui.theme","value":"light","comment":"Example"}'
```

### `PUT /v1/preference/:preferenceName`

```sh
curl -sS "$API/preference/ui.theme" \
  -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"dark"}'
```

### `DELETE /v1/preference/:preferenceName`

```sh
curl -sS "$API/preference/ui.theme" -X DELETE -H "Authorization: Bearer $TOKEN"
```

---

## Helper

### `GET /v1/helper/status` (all status names)

```sh
curl -sS "$API/helper/status" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/helper/status/object` (all objects)

```sh
curl -sS "$API/helper/status/object" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/helper/status/object/:objectName`

```sh
curl -sS "$API/helper/status/object/poll" -H "Authorization: Bearer $TOKEN"
```

### `GET /v1/helper/status/id/:statusName`

```sh
curl -sS "$API/helper/status/id/In%20Progress" -H "Authorization: Bearer $TOKEN"
```

---

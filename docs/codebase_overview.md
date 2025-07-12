# Codebase Overview

## Application structure

The API server is implemented with [Express](https://expressjs.com/) and starts in [`app.js`](../app.js). At startup the app loads configuration from [`config/wotlwedu.js`](../config/wotlwedu.js) and establishes the Sequelize database connection before registering routes.

## Configuration

All runtime settings come from environment variables with fallbacks defined in `config/wotlwedu.js`. Important options include the listening port and database credentials shown on lines 5–11:

```javascript
module.exports.app_port = process.env.WOTLWEDU_APP_PORT || 9876;
module.exports.app_listen = process.env.WOTLWEDU_APP_LISTEN || "0.0.0.0";
module.exports.db_host = process.env.WOTLWEDU_DB_HOST || "localhost";
module.exports.db_user = process.env.WOTLWEDU_DB_USER || "wotlwedu";
module.exports.db_database = process.env.WOTLWEDU_DB_NAME || "wotlwedu";
```

Further options configure mail providers and SSL certificates for HTTPS support.

## Database layer

The project uses [Sequelize](https://sequelize.org/) to manage a MariaDB database. Connection parameters are passed to Sequelize in [`util/database.js`](../util/database.js). Lines 5–21 define the connection options and pool settings:

```javascript
const options = {
  host: Config.db_host,
  dialect: "mariadb",
  omitNull: false,
};
if (Config.db_logging === false) {
  options.logging = false;
}
options.pool = {
  max: 5,
  min: 0,
  acquire: 30000,
  idle: 10000
};
```

Model definitions are stored under the `model/` directory and relationships are wired up in [`model/associations.js`](../model/associations.js). These associations connect users, roles, groups, lists, elections and more as seen around lines 22–80.

## Routing and controllers

The Express app registers route modules for each resource (users, items, elections, etc.) beginning around line 28 of `app.js`. Each file under `routes/` maps HTTP verbs to functions exported from corresponding controllers in `controllers/`.

The controller functions typically validate permissions, interact with Sequelize models and return JSON using a helper called `StatusResponse`.

## Real-time features and housekeeping

Socket.IO support is implemented in [`util/wotlwedu-socketio.js`](../util/wotlwedu-socketio.js) to push notifications to connected clients. Housekeeping tasks such as expiring elections or clearing stale tokens run on an interval defined by `Config.housekeepingInterval` (see `util/housekeeping.js`).

## Documentation

API endpoints are documented with an OpenAPI spec. Opening [`docs/index.html`](index.html) in a browser presents the Swagger UI which loads `openapi.yaml` to display interactive docs.


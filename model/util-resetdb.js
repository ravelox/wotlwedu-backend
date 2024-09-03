/*
This initialisation routine will drop the database and recreate a user with
privileges to update it.
In order to do that, this script requires a user with sufficient permissions
*/
const mysql = require("mysql2");
const Config = require("../config/wotlwedu");
const { EagerLoadingError } = require("sequelize");

const DB_ROOT_USER = process.env.WOTLWEDU_DB_ROOT_USER || Config.db_user;
const DB_ROOT_PASSWORD =
  process.env.WOTLWEDU_DB_ROOT_PASSWORD || Config.db_password;

const connection = mysql.createConnection({
  host: Config.db_host,
  user: DB_ROOT_USER,
  password: DB_ROOT_PASSWORD,
});

connection.connect(function (err) {
  if (err) throw err;
  connection.query(
    "DROP DATABASE IF EXISTS " + Config.db_database,
    function (err, result) {
      if (err) {
        throw err;
      }

      console.log("Database dropped");
    }
  );
  connection.query(
    "DROP USER IF EXISTS " + Config.db_user,
    function (err, result) {
      if (err) {
        throw err;
      }
      console.log("User dropped");
    }
  );

  connection.query(
    "CREATE DATABASE " + Config.db_database,
    function (err, result) {
      if (err) {
        throw err;
      }
      console.log("Database created");
    }
  );

  connection.query("USE " + Config.db_database, function (err, result) {
    if (err) throw err;
  });

  connection.query(
    "CREATE USER '" +
      Config.db_user +
      "'@'%' IDENTIFIED BY '" +
      Config.db_password +
      "';",
    function (err, result) {
      if (err) throw err;
      console.log("User created");
    }
  );

  connection.query(
    "GRANT ALL PRIVILEGES ON " +
      Config.db_database +
      ".* TO '" +
      Config.db_user +
      "'@'%'",
    function (err, result) {
      if (err) throw err;

      console.log("Privileges granted");
    }
  );

  connection.query("FLUSH PRIVILEGES", function (err, result) {
    if (err) throw err;
    console.log("Privileges flushed")
  });

  connection.end();
});

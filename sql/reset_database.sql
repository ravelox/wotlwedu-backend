DROP DATABASE IF EXISTS wotlwedu;
DROP USER IF EXISTS 'wotlwedu'@'%';

CREATE DATABASE wotlwedu;

USE wotlwedu;

CREATE USER 'wotlwedu'@'%' IDENTIFIED BY 'wotlwedu';
GRANT ALL PRIVILEGES ON wotlwedu.* TO 'wotlwedu'@'%';
FLUSH PRIVILEGES;

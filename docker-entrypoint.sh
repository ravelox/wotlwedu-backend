#!/bin/bash
echo "Holding for database server initialisation"

export WOTLWEDU_COUNTER=0
while [ $WOTLWEDU_COUNTER -le 30 ]
do
    echo -n "."
    export WOTLWEDU_COUNTER=$(( $WOTLWEDU_COUNTER + 2 ))
    sleep 2
done


if [ -z "$WOTLWEDU_DB_HOST" ]
then
    export WOTLWEDU_DB_HOST=localhost
fi
if [ -z "$WOTLWEDU_DB_NAME" ]
then
    export WOTLWEDU_DB_NAME=wotlwedu
fi
if [ -z "$WOTLWEDU_DB_USER" ]
then
    export WOTLWEDU_DB_USER=wotlwedu
fi
if [ -z "$WOTLWEDU_DB_PASSWORD" ]
then
    export WOTLWEDU_DB_PASSWORD=wotlwedu
fi

#
# Install the mariadb-client package for database checking
#
apt-get install -y mariadb-client

echo "Checking for database"
DATABASE_PRESENT=$(mariadb -h $WOTLWEDU_DB_HOST -u root <<< "SHOW DATABASES;" | grep ${WOTLWEDU_DB_NAME} | wc -l)

if [ $DATABASE_PRESENT -eq 1 ]
then
   echo "Database exists"
else
    echo "Database not present"
    echo "Using parameters:"
    echo "      Database name: ${WOTLWEDU_DB_NAME}"
    echo "      Database user: ${WOTLWEDU_DB_USER}"
    echo "      Database password: ${WOTLWEDU_DB_PASSWORD}"

    sed -e "s/##dbname##/${WOTLWEDU_DB_NAME}/" -e "s/##dbuser##/${WOTLWEDU_DB_USER}/" -e "s/##dbpassword##/${WOTLWEDU_DB_PASSWORD}/" sql/reset_database.sql.template > reset_database.sql
    mariadb -h ${WOTLWEDU_DB_HOST} -u root < reset_database.sql
fi
echo
echo
echo "Initialisation complete"

exec npm start
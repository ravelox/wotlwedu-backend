#!/bin/bash
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
if [ -z "$WOTLWEDU_DB_ROOT_USER" ]
then
    export WOTLWEDU_DB_ROOT_USER=root
fi
if [ -z "$WOTLWEDU_DB_ROOT_PASSWORD" ]
then
    export WOTLWEDU_DB_ROOT_PASSWORD=$WOTLWEDU_DB_PASSWORD
fi

echo "Waiting for database readiness"
export WOTLWEDU_DB_WAIT_TIMEOUT_SECONDS=${WOTLWEDU_DB_WAIT_TIMEOUT_SECONDS:-30}
export WOTLWEDU_COUNTER=0
until mariadb-admin ping -h "$WOTLWEDU_DB_HOST" -u "$WOTLWEDU_DB_ROOT_USER" --password="$WOTLWEDU_DB_ROOT_PASSWORD" --silent >/dev/null 2>&1
do
    if [ "$WOTLWEDU_COUNTER" -ge "$WOTLWEDU_DB_WAIT_TIMEOUT_SECONDS" ]
    then
        echo "Database did not become ready within ${WOTLWEDU_DB_WAIT_TIMEOUT_SECONDS}s"
        exit 1
    fi
    echo -n "."
    sleep 1
    export WOTLWEDU_COUNTER=$(( WOTLWEDU_COUNTER + 1 ))
done
echo

echo "Checking for database"
DATABASE_PRESENT=$(mariadb -h $WOTLWEDU_DB_HOST -u ${WOTLWEDU_DB_ROOT_USER} --password="${WOTLWEDU_DB_ROOT_PASSWORD}" <<< "SHOW DATABASES;" | grep ${WOTLWEDU_DB_NAME} | wc -l)

if [ $DATABASE_PRESENT -eq 1 ]
then
   echo "Database exists"
else

    if [ -z "$WOTLWEDU_DB_ROOT_USER" ]
    then
        echo "WOTLWEDU_DB_ROOT_USER must be set"
        exit 1
    fi

    if [ -z "$WOTLWEDU_DB_ROOT_PASSWORD" ]
    then
        echo "WOTLWEDU_DB_ROOT_PASSWORD must be set"
        exit 1
    fi

    echo "Database not present"
    echo "Using parameters:"
    echo "      Root User: ${WOTLWEDU_DB_ROOT_USER}"
    echo "      Database name: ${WOTLWEDU_DB_NAME}"
    echo "      Database user: ${WOTLWEDU_DB_USER}"
    echo "      Database password: ${WOTLWEDU_DB_PASSWORD}"

#    sed -e "s/##dbname##/${WOTLWEDU_DB_NAME}/" -e "s/##dbuser##/${WOTLWEDU_DB_USER}/" -e "s/##dbpassword##/${WOTLWEDU_DB_PASSWORD}/" sql/reset_database.sql.template > reset_database.sql
#    mariadb -h ${WOTLWEDU_DB_HOST} -u ${WOTLWEDU_DB_ROOT_USER}  --password="${WOTLWEDU_DB_ROOT_PASSWORD}" < reset_database.sql

    export OLDDIR=$(pwd)
    cd model
    node util-resetdb
    cd ${OLDDIR}
    
fi

export OLDDIR=$(pwd)
cd model
# Always ensure the baseline schema exists before running incremental updates.
# This handles the common case where the database exists but tables do not yet.
node util-createdb || exit 1
node util-updatedb || exit 1
cd ${OLDDIR}

echo
echo
echo "Initialisation complete"

exec npm start

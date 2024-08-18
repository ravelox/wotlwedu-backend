FROM node:slim

WORKDIR /var/opt/wotlwedu-app

RUN apt-get update && apt-get install -y mariadb-client

COPY . .
RUN npm install

EXPOSE 9876

CMD ["/var/opt/wotlwedu-app/docker-entrypoint.sh"]
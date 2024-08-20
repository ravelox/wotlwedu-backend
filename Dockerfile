FROM node:slim

WORKDIR /var/opt/wotlwedu-backend

RUN apt-get update && apt-get install -y mariadb-client

COPY . .
RUN npm install

EXPOSE 9876

CMD ["/var/opt/wotlwedu-backend/docker-entrypoint.sh"]
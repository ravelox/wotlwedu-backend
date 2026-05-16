FROM node:20-bookworm-slim

WORKDIR /var/opt/wotlwedu-backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends mariadb-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p public/images \
  && chown -R node:node /var/opt/wotlwedu-backend

USER node

EXPOSE 9876

CMD ["/var/opt/wotlwedu-backend/docker-entrypoint.sh"]

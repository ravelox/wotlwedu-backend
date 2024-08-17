FROM node:slim

WORKDIR /var/opt/wotlwedu-app

COPY . .
RUN npm install

EXPOSE 9876

CMD ["npm", "start"]
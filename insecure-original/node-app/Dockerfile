FROM node:8.12.0-alpine

RUN mkdir -p /opt/backend
ADD package.json /opt/backend
WORKDIR /opt/backend
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "dev"]

ADD . /opt/backend

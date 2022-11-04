FROM node@sha256:d75742c5fd41261113ed4706f961a21238db84648c825a5126ada373c361f46e AS build-env
RUN mkdir -p /opt/backend
ADD package.json /opt/backend
WORKDIR /opt/backend
RUN npm install
ADD . /opt/backend

FROM gcr.io/distroless/nodejs@sha256:b23fd429ffdb078aabe6efb4378430105908e344445e7e76135c6a3b49ded9c8
COPY --from=build-env /opt/backend /app
WORKDIR /app
EXPOSE 3000
CMD ["index.js"]
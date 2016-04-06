# pull base image
FROM docker.creativelive.com:5000/baseimage/cl-baseimage:latest

# install dependencies
RUN apt-get update
RUN apt-get install -y imagemagick build-essential

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /var/node/mkimage-server && cp -a /tmp/node_modules /var/node/mkimage-server

# copy files
WORKDIR /var/node/mkimage-server
ADD . /var/node/mkimage-server

# define default command
CMD node app.js

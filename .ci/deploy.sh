#!/bin/bash

set -x

# exit on error
set -e
# setup bash
shopt -s extglob

# BUILD VARIABLES
REGISTRY="docker.creativelive.com:5000"
APP="mkimage-server"
APP_VERSION=$(cat package.json | /usr/bin/jsawk 'return this.version')
GIT_BRANCH=${GIT_BRANCH}
BRANCH=$(basename $GIT_BRANCH)
REPONAME="${APP}-${BRANCH}"

IMAGEID=$(docker build -t $REGISTRY/${REPONAME}:${APP_VERSION} . | tail -1 | sed 's/.*Successfully built \(.*\)$/\1/')
docker tag -f ${IMAGEID} $REGISTRY/${REPONAME}:latest

docker push $REGISTRY/$REPONAME

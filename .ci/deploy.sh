#!/bin/bash

set -x

# exit on error
set -e
# setup bash
shopt -s extglob

# BUILD VARIABLES
REGISTRY="docker.creativelive.com:5000"
APP=$(jq -r '.name' < package.json)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
BASE_BRANCH=$(basename $GIT_BRANCH)
BRANCH=$(echo ${BASE_BRANCH} | awk '{ print tolower($0) }')
NAME=$APP-$BRANCH

# BUMP VERSION
# install dependencies
cd .ci
npm install
BUILD_TAG=$(node ./node_modules/\@creativelive/gulp-docker-version-bump/script.js -j -n ${NAME} -p $(pwd)/../package.json)
cd ..

# COMMIT CHANGE
git commit -m 'bump version by jenkins' package.json && \
git push --no-verify origin $BASE_BRANCH

# setup docker build
docker build -t $BUILD_TAG .
docker tag $BUILD_TAG $REGISTRY/$NAME:latest

docker push $REGISTRY/$NAME

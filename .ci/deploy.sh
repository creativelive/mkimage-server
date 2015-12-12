#!/bin/bash

set -x

# exit on error
set -e
# setup bash
shopt -s extglob

# BUILD VARIABLES
REGISTRY="docker.creativelive.com:5000"
APP="mkimage-server"
GIT_BRANCH=${GIT_BRANCH}
BRANCH=$(basename $GIT_BRANCH)
REPONAME="${APP}-${BRANCH}"

# BUMP VERSION
# install dependencies
npm install
node_modules/gulp/bin/gulp.js version -j -n $APP-$BRANCH

# COMMIT CHANGE
# cleanup pre-push hook
rm -f .git/hooks/pre-push
git commit -m 'bump version by jenkins' package.json
git push origin $BRANCH

APP_VERSION=$(cat package.json | /usr/bin/jsawk 'return this.version')

IMAGEID=$(docker build -t $REGISTRY/${REPONAME}:${APP_VERSION} . | tail -1 | sed 's/.*Successfully built \(.*\)$/\1/')
docker tag -f ${IMAGEID} $REGISTRY/${REPONAME}:latest

docker push $REGISTRY/$REPONAME

# update package version on jenkins
cat ~/build_versions/ci/versions.json | jq --arg VERSION "$APP_VERSION" --arg APP "$REPONAME" 'to_entries | map(if .key == $APP then . + { "value": $VERSION } else . end ) | from_entries' > ~/build_versions/ci/versions.json.tmp
mv ~/build_versions/ci/versions.json.tmp ~/build_versions/ci/versions.json

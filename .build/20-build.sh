#!/usr/bin/env bash
if [ ! -f package.json ]; then
  echo "*** skipping npm build -- no package.json"
  exit 0
fi

if [ -z "${PACKAGE_NAME}" ]; then source ".build/00-setup.sh"; fi

prepare_build_phase

npm ci --registry="$(npm_registry)" && npm run jenkins-build --if-present

if [ $? -ne 0 ]; then
  echo "*** build failed!"
  exit 1
fi


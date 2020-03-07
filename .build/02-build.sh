#!/usr/bin/env bash

if [[ -z "${PACKAGE_NAME}" ]]; then source ".build/00-setup.sh"; fi

echo "*** Build..."

if [[ -f package.json ]]; then
  npm ci --registry=$(npm_registry)

  if [ $? -ne 0 ]; then
    echo "build failed!"
    exit 1
  fi
else
  echo "skipping npm build -- no package.json"
fi

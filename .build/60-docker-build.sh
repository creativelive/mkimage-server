#!/usr/bin/env bash

if [ -z "${PACKAGE_NAME}" ]; then source ".build/00-setup.sh"; fi

echo "*** Docker build..."

if [ -f Dockerfile.src ]; then
  rm -f Dockerfile
  export NPM_REGISTRY="$(npm_registry)"
  export DOCKER_REGISTRY="$(docker_registry)"
  envsubst < Dockerfile.src > Dockerfile
fi

if [ -f Dockerfile ]; then

  if [ -f package.json ]; then
    echo "** preparing for npm install inside build container..."
    mkdir -p build
    cp -f package.json package-lock.json build

    npmrc="$(npmrc)"
    if [ -f "${npmrc}" ]; then
      cp -f "${npmrc}" build/.npmrc
    fi
  fi

  if is_prod_branch "$(branch_name)"; then
    docker_build -t "${DOCKER_DEV_REGISTRY}/$(docker_artifact)" \
                 -t "${DOCKER_DEV_REGISTRY}/$(docker_latest)" \
                 -t "${DOCKER_PROD_REGISTRY}/$(docker_artifact)" \
                 -t "${DOCKER_PROD_REGISTRY}/$(docker_latest)" \
    .
  else
    docker_build -t "${DOCKER_DEV_REGISTRY}/$(docker_artifact)" \
                 -t "${DOCKER_DEV_REGISTRY}/$(docker_latest)" \
    .

  fi
  if [ $? -ne 0 ]; then
    echo "** docker build failed!"
    exit 1
  else
    echo "** built and tagged $(docker_artifact) as $(docker_latest)"
  fi
  rm -rf build
else
  echo "(skipping Docker build -- no Dockerfile)"
fi

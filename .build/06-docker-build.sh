#!/usr/bin/env bash

if [[ -z "${PACKAGE_NAME}" ]]; then source ".build/00-setup.sh"; fi

echo "*** Docker build..."

name=$(package_name)
artifact=$(docker_artifact)

if [[ -f Dockerfile.src ]]; then
  rm -f Dockerfile
  export BASEIMAGE="$(docker_registry)/cl-baseimage-alpine:$(docker_base_tag)"
  cat Dockerfile.src | envsubst > Dockerfile
fi

if [[ -f Dockerfile ]]; then

  rm -f "${name}.tar"
  rm -f "${name}.tar.gz"

  uuid=`uuidgen| tr '[:upper:]' '[:lower:]'`
  build="${name}:${uuid}"

  if [[ -f package.json ]]; then
    base="$(docker_registry)/cl-baseimage-alpine:$(docker_base_tag)"
    echo "** running npm install inside base container ${base}..."
    mkdir -p out

    if [[ ! -z "${NPM_CONFIG_USERCONFIG}" ]]; then
      echo "build provided .npmrc file"
    elif [[ -f .npmrc ]]; then
      export NPM_CONFIG_USERCONFIG=".npmrc"
    else
      export NPM_CONFIG_USERCONFIG=`npm config get userconfig`
      echo "no .npmrc file found, will use ${NPM_CONFIG_USERCONFIG}"
    fi

    cp -f package.json package-lock.json out
    cp -f "${NPM_CONFIG_USERCONFIG}" out/.npmrc

    docker run -t -w /out -v `pwd`/out:/out "${base}" npm ci --unsafe-perms --production --registry=$(npm_registry)

    rm -f out/.npmrc

    if [[ ! -d out/node_modules ]]; then
      echo "** failed to build inside container!"
      exit 1
    fi
  fi

  docker build -t ${build} . #\
#    && docker save ${build} > ${name}.tar \
#    && gzip ${name}.tar 


  if [ $? -ne 0 ]; then
    echo "docker build failed!"
    exit 1
  else
    echo "tagging build..."

    latest=$(docker_latest)

    if [[ $(branch_name) == "release" ]]; then
      docker tag ${build} ${DOCKER_PROD_REGISTRY}/${artifact}
      docker tag ${build} ${DOCKER_PROD_REGISTRY}/${latest}
    fi
    docker tag ${build} ${DOCKER_DEV_REGISTRY}/${artifact}
    docker tag ${build} ${DOCKER_DEV_REGISTRY}/${latest}
  fi

else
  echo "(skipping Docker build -- no Dockerfile)"
fi

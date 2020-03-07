#!/usr/bin/env bash

if [[ -z "${PACKAGE_NAME}" ]]; then source ".build/00-setup.sh"; fi

if [[ -f Dockerfile ]]; then

  artifact=$(docker_artifact)
  latest=$(docker_latest)

  docker push "$(docker_registry)/${artifact}" \
    && docker push "$(docker_registry)/${latest}"

  if [[ "$(branch_name)" == "release" ]]; then
    echo "*** Pushing to ${DOCKER_PROD_REGISTRY}..."
    docker push "${DOCKER_PROD_REGISTRY}/${artifact}" \
      && docker push "${DOCKER_PROD_REGISTRY}/${latest}"
  fi
  echo "*** Pushing to ${DOCKER_DEV_REGISTRY}..."
  docker push "${DOCKER_DEV_REGISTRY}/${artifact}" \
    && docker push "${DOCKER_DEV_REGISTRY}/${latest}" 

  if [ $? -eq 0 ]; then
    echo "*** Successfully pushed ${artifact} ***"
  else
    echo "*** Build failed!"
  fi
else
  echo "(skipping docker publish -- no Dockerfile)"
fi

#!/usr/bin/env bash

if [ -z "${PACKAGE_NAME}" ]; then source ".build/00-setup.sh"; fi

if [ ! -f package.json ]; then
  echo "*** (not publishing to NPM -- no package.json)"
  exit 0
fi

prepare_build_phase

echo "*** Publishing to NPM registry..."

if [[ "$(package_scope)" =~ "creativelive" ]]; then
  if is_prod_branch "$(branch_name)"; then
    npm publish --production --registry="${NPM_PROD_REGISTRY}"
    npm publish --production --registry="${NPM_DEV_REGISTRY}"  # back-publish prod artifacts to dev
  else
    npm publish --tag "$(prerelease_tag)" --registry="${NPM_DEV_REGISTRY}"
  fi
else
  echo "*** ${PACKAGE_NAME} package.json name does not have @creativelive scope"
  exit 1
fi

if [ $? -ne 0 ]; then
  echo "*** npm publish failed!"
  exit 1
fi


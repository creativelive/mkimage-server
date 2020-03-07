#!/usr/bin/env bash

if [[ -z "${PACKAGE_NAME}" ]]; then source ".build/00-setup.sh"; fi


rm -f "${COMMIT_FILENAME}"

name="$(package_name)"
version="$(package_version)"
bump="false"

echo "*** Checking package scope..."

current_scope="$(package_scope)"

update_scope

if [[ "$(package_scope)" != "${current_scope}" ]]; then
  echo "updated package scope to @$(package_scope)/$(package_name)"
fi

echo "*** Checking package version..."

if [[ -f package.json ]]; then

  if [[ "${bump}" == "false" && ! -z "$(prerelease_tag)" && "$(package_prerelease_tag)" != "$(prerelease_tag)" ]]; then
    echo "package version ${version} needs to be updated with prerelease tag of $(prerelease_tag)"
    bump="true"
  fi

  if [[ "${bump}" == "false" && -z $(prerelease_tag) && ! -z "$(package_prerelease_tag)" ]]; then
    echo "package version ${version} needs to be updated to a release version"
    bump="true"
  fi

  if [[ "${bump}" == "false" && $(is_version_published_npm "${version}") == "true" ]]; then
    echo "package version ${version} is already published, incrementing version..."
    bump="true"
  else
    if [[ "${bump}" == "false" ]]; then
      echo "package version ${version} is not yet published, no need to increment yet"
    fi
  fi

  until [[ "${bump}" == "false" ]]; do
    updated="$(package_version)"

    bumped=$(bump_version)
    updated="$(package_version)"
    echo "checking ${updated}..."

    bump=$(is_version_published_npm "${updated}")
  done

else
  if bump_version; then
    updated="$(package_version)"
  fi
fi

echo $(package_version) > .version.tmp

if [[ ! -z "${updated}" ]] && [[ "${updated}" != "${version}" ]]; then
  echo "..updated from ${version} to ${updated}"
fi


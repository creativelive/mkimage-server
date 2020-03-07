#!/usr/bin/env bash

if [[ -z "${PACKAGE_NAME}" ]]; then source ".build/00-setup.sh"; fi

if [[ ! -f "${COMMIT_FILENAME}" ]]; then
  echo "*** Nothing to commit!"
  exit 0
fi


if [[ "$(branch_name)" != "SNAPSHOT" ]]; then
  echo "*** Committing updates to Github..."

  git_config_user=$(git config user.name)
  if [[ -z "${git_config_user}" ]]; then
    if [[ ! -z "${GIT_USER}" ]]; then
      git config user.name "${GIT_USER}"
    else
      echo "no GIT_USER specified!  exiting..."
      exit 1
    fi
  else
    if [[ -z "${GIT_USER}" ]]; then
      export GIT_USER="${git_config_user}"
    fi
  fi

  git_config_email=$(git config user.email)
  if [[ -z "${git_config_email}" ]]; then
    if [[ ! -z "${GIT_EMAIL}" ]]; then
      git config user.email "${GIT_EMAIL}"
    else
      echo "no GIT_EMAIL specified!  exiting..."
      exit 1
    fi
  else
    if [[ -z "${GIT_EMAIL}" ]]; then
      export GIT_EMAIL="${git_config_email}"
    fi
  fi

echo "configured with ${GIT_USER} <${GIT_EMAIL}>"

  origin_url=$(git remote get-url origin)

  if [[ ! -z "${GIT_PASSWORD}" ]] && [[ ! -z "${GIT_USER}" ]]; then
    echo "applying git creds to ${origin_url}..."
    origin_url=$(apply_git_creds "${origin_url}" "${GIT_USER}" "${GIT_PASSWORD}")
  fi

  if [[ -z "${origin_url}" ]]; then
    echo "no remote origin!  exiting..."
    exit 1
  else
    echo "ORIGIN=${origin_url}"
  fi

  files=""

  for f in $(cat "${COMMIT_FILENAME}"); do
    if [[ -f ${f} ]]; then
      git add ${f}
      files="${files} ${f}"
    fi
  done
  rm -f "${COMMIT_FILENAME}"

  if [[ ! -z "${files}" ]]; then
    git remote set-url origin "${origin_url}" \
      && git commit -m "${GIT_USER} <${GIT_EMAIL}> updated version to $(package_version)" ${files} \
      && git push --no-verify origin "$(branch_name)"
  else
    echo "(skipping... no version files to commit)"
  fi
else
  echo "(not updating git with package info because this is a local snapshot)"
fi

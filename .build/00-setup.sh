#!/usr/bin/env bash

if [ -z "${DOCKER_DEV_REGISTRY}" ]; then
  export DOCKER_DEV_REGISTRY="docker.dev.creativelive.com"
  echo "warning, DOCKER_DEV_REGISTRY was not provided, assuming ${DOCKER_DEV_REGISTRY}"
fi

if [ -z "${DOCKER_PROD_REGISTRY}" ]; then
  export DOCKER_PROD_REGISTRY="docker.prod.creativelive.com"
  echo "warning, DOCKER_PROD_REGISTRY was not provided, assuming ${DOCKER_PROD_REGISTRY}"
fi

if [ -z "${NPM_DEV_REGISTRY}" ]; then
  export NPM_DEV_REGISTRY="https://npm.dev.creativelive.com"
  echo "warning, NPM_DEV_REGISTRY was not provided, assuming ${NPM_DEV_REGISTRY}"
fi

if [ -z "${NPM_PROD_REGISTRY}" ]; then
  export NPM_PROD_REGISTRY="https://npm.prod.creativelive.com"
  echo "warning, NPM_PROD_REGISTRY was not provided, assuming ${NPM_PROD_REGISTRY}"
fi


urlencode() {
    # urlencode <string>
    old_lc_collate=$LC_COLLATE
    LC_COLLATE=C

    local length="${#1}"
    for (( i = 0; i < length; i++ )); do
        local c="${1:i:1}"
        case $c in
            [a-zA-Z0-9.~_-]) printf "$c" ;;
            *) printf '%%%02X' "'$c" ;;
        esac
    done

    LC_COLLATE=$old_lc_collate
}

urldecode() {
    # urldecode <string>

    local url_encoded="${1//+/ }"
    printf '%b' "${url_encoded//%/\\x}"
}

# usage: origin username password
apply_git_creds() {
  origin=$1
  user=$2
  password=$3

  user_encoded=$(urlencode ${user})
  password_encoded=$(urlencode ${password})
  origin_stripped=$(echo "${origin}" | sed -E "s#(http.?)://(.+@)?(.+)#\1://\3#g")
  origin_result=$(echo "${origin_stripped}" | sed -E "s#://#://${user_encoded}:${password_encoded}@#g")

  echo "${origin_result}"
}

full_package_name() {
  if [[ -f package.json ]]; then
    echo $(cat package.json | jq -r .name)
  elif [[ -f .name ]]; then
    cat .name
  else
    echo $(basename `pwd`)
  fi
}

parse_scope() {
  local package="$1"

  echo "$1" | sed -E "s/^(@(.+)\/)?(.+)$/\2/g"
}

package_scope() {
  if [[ -f package.json ]]; then
    local name=$(cat package.json | jq -r .name)
    parse_scope "${name}" 
  else
    echo ""
  fi
}

branch_scope() {
  branch=$(branch_name)
#  if [[ "${branch}" == "release" ]]; then
    echo "creativelive"
#  else
#    echo "creativelive-dev"
#  fi
}

package_name() {
  if [[ -f package.json ]]; then
    echo $(cat package.json | jq -r .name | sed -E "s/^(@.+\/)?(.+)$/\2/g")
  elif [[ -f .name ]]; then
    cat .name
  else
    echo $(basename `pwd`)
  fi
}

package_version() {
  if [[ -f package.json ]]; then
    version=$(cat package.json | jq -r .version)
  else
    if [[ -f .version ]]; then
      version=$(cat .version)
    fi
  fi
  if `echo "${version}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+.*$'`; then
    echo "${version}"
  else
    echo "0.1.0"
  fi
}


branch_name() {
  if [[ ! -z "${CURRENT_BRANCH}" ]]; then
    echo ${CURRENT_BRANCH}
  else
    branch=$(git symbolic-ref --short HEAD)
    if [[ ! -z "${branch}" ]]; then
      echo ${branch}
    else
      echo "SNAPSHOT"
    fi
  fi
}

prerelease_tag() {
  branch="$(branch_name)"
  if [[ "${branch}" != "release" ]]; then
    echo "${branch}" | tr ' _/+.' - | tr '[:upper:]' '[:lower:]'
  fi
}

package_prerelease_tag() {
  echo $(package_version) | sed -E "s#([0-9]+\.[0-9]+\.[0-9]+)(-([^.]+)(\.(.+))?)?#\3#g"
}

package_prerelease_build() {
  echo $(package_version) | sed -E "s#([0-9]+\.[0-9]+\.[0-9]+)(-([^.]+)(\.(.+))?)?#\5#g"
}


is_version_published_npm() {
  version="$1"

  if npm view --registry="$(npm_registry)" --silent --json "$(full_package_name)" | jq -r ".versions[]?" | grep -qx "${version}" ; then
    echo "true"
    return 0
  else
    echo "false"
    return 1
  fi
}

bump_version_generic() {
  version=$(package_version)
  branch=$(branch_name)
  if [[ "${branch}" == "release" ]]; then
    updated=$(echo ${version}|perl -pe 's/^(\d+)\.(\d+)\.(\d+)(.*)$/$1.".".$2.".".($3+1)/e')
  else
    updated=$(echo ${version}|perl -pe 's/^(\d+)\.(\d+)\.(\d+)(.*)$/$1.".".$2.".".$3/e')
    if [[ -z "${BUILD_NUMBER}" ]]; then
      BUILD_NUMBER="t$(date +%s)"
    fi
    updated="${updated}-$(prerelease_tag).${BUILD_NUMBER}"
  fi
  echo "${updated}" > .version
  if [ $? -ne 0 ]; then
    echo "failed to bump version!"
    exit 1
  fi
  echo .version >> "${COMMIT_FILENAME}"
  echo "${updated}"
}

bump_version_npm() {
  if [[ "$(branch_name)" == "release" ]]; then
    version=$(npm version --no-git-tag-version patch)
  else
    version=$(npm version --no-git-tag-version prerelease --preid="$(prerelease_tag)")
  fi
  if [ $? -ne 0 ]; then
    echo "failed to bump version!"
    exit 1
  fi
  echo package.json >> "${COMMIT_FILENAME}"
  echo "$(package_version)"
}

bump_version() {
  if [[ -f package.json ]]; then
    bump_version_npm
  else
    bump_version_generic
  fi
}

update_scope_npm() {

  if [[ "$(package_scope)" != "$(branch_scope)" ]]; then
    local new_name="@$(branch_scope)/$(package_name)"
    cat package.json | jq ".name = \"${new_name}\"" > package.json.tmp
    mv -f package.json.tmp package.json
    echo package.json >> "${COMMIT_FILENAME}"
  fi
}

update_scope() {
# warning - bump_version removes commit filename
  if [[ -f package.json ]]; then
    update_scope_npm
  fi
}


docker_artifact() {
  echo "$(package_name):$(package_version)"
}

sanitize() {
  echo "${1}" | tr -sC '[:alnum:]' '-' | tr '[:upper:]' '[:lower:]' | sed -E 's/^[-]*(.*[^-])[-]*$/\1/g'
}

docker_latest_tag() {
  branch="$(branch_name)"
  tag="latest"
  if [[ "${branch}" != "release" ]]; then
      tag=$(sanitize "${branch}-latest")
  fi
  echo "${tag}"
}

docker_latest() {
  echo "$(package_name):$(docker_latest_tag)"
}

docker_registry() {
  branch="$(branch_name)"
  if [[ "${branch}" == "release" ]]; then
    echo "${DOCKER_PROD_REGISTRY}"
  else
    echo "${DOCKER_DEV_REGISTRY}"
  fi
}

npm_registry() {
  branch="$(branch_name)"
  if [[ "${branch}" == "release" ]]; then
    echo "${NPM_PROD_REGISTRY}"
  else
    echo "${NPM_DEV_REGISTRY}"
  fi
}

 

docker_base_tag() {
  if [[ "$(branch_name)" == "release" ]]; then
    echo "latest"
  else
    echo "master-latest"
  fi
}


COMMIT_FILENAME=".commit.tmp"


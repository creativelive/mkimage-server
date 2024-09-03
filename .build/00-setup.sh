#!/usr/bin/env bash

if [ -z "${DOCKER_DEV_REGISTRY}" ]; then
  export DOCKER_DEV_REGISTRY="docker.dev.creativelive.com"
fi

if [ -z "${DOCKER_PROD_REGISTRY}" ]; then
  export DOCKER_PROD_REGISTRY="docker.prod.creativelive.com"
fi

if [ -z "${NPM_DEV_REGISTRY}" ]; then
  export NPM_DEV_REGISTRY="https://npm.dev.creativelive.com"
fi

if [ -z "${NPM_PROD_REGISTRY}" ]; then
  export NPM_PROD_REGISTRY="https://npm.prod.creativelive.com"
fi
export DOCKER_CLI_HINTS=false

COMMIT_FILENAME=".commit.tmp"

add_commit_file() {

  if [ -f "${COMMIT_FILENAME}" ]; then
    if ! grep -qxF "$1" "${COMMIT_FILENAME}"; then
      echo "$1" >> "${COMMIT_FILENAME}"
    fi
  else
    echo "$1" > "${COMMIT_FILENAME}"
  fi
  grep -qxF "$1" "${COMMIT_FILENAME}"
}

subproject_name() {
  if [ -n "${SUBPROJECT_NAME}" ]; then
    echo "${SUBPROJECT_NAME}"
  elif [ -f ../build.sh ]; then
    basename "$(pwd)"
  elif [ -d .git ] && [ -d ../.git ]; then
    basename "$(pwd)"
  fi
}

project_dir() {
  if [ -n "${PROJECT_DIR}" ]; then
    echo "${PROJECT_DIR}"
  elif [ -n "$(subproject_name)" ]; then
    dirname "$(pwd)"
  else
    pwd
  fi
}

work_dir() {
  if [ -n "${WORK_DIR}" ]; then
    echo "${WORK_DIR}"
  else
    if [ -n "$(subproject_name)" ]; then
      echo "/build/$(subproject_name)"
    else
      echo "/build"
    fi
  fi
}

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
  if [ -f package.json ]; then
    jq -r .name < package.json
  elif [ -f .name ]; then
    cat .name
  else
    basename "$(pwd)"
  fi
}


package_scope() {
  if [ -f package.json ]; then
    jq -r .name < package.json | sed -E "s/^(@(.+)\/)?(.+)$/\2/g"
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


is_git() {
  if [ "$(git rev-parse --inside-work-tree 2> /dev/null)" ]; then
    echo true;
  else
    echo "";
  fi
}

branch_name() {
  if [ -n "${CURRENT_BRANCH}" ]; then
    echo "${CURRENT_BRANCH}"
  elif [ "$(is_git)" ]; then
    branch="$(git symbolic-ref --short HEAD)"
    if [ -n "${branch}" ]; then
      echo "${branch}"
    else
      echo "SNAPSHOT"
    fi
  else
    echo "SNAPSHOT"
  fi
}

prerelease_tag() {
  branch="$(branch_name)"
  if [ "${branch}" != "release" ]; then
    echo "${branch}" | tr ' _/+.' - | tr '[:upper:]' '[:lower:]'
  fi
}

package_name() {
  if [ -f package.json ]; then
    jq -r .name < package.json | sed -E "s/^(@.+\/)?(.+)$/\2/g"
  elif [ -f .name ]; then
    cat .name
  else
    basename "$(pwd)"
  fi
}

package_version() {
  if [ -f package.json ]; then
    version=$(jq -r .version < package.json)
  else
    if [ -f .version ]; then
      version=$(cat .version)
    fi
  fi
  if echo "${version}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+.*$'; then
    echo "${version}"
  else
    echo "0.1.0"
  fi
}

package_version_major() {
  package_version | sed -E 's/^([0-9]+)\..+/\1/'
}

package_version_minor() {
  package_version | sed -E 's/^[0-9]+\.([0-9]+)\..+/\1/'
}

package_version_patch() {
  package_version | sed -E 's/^[0-9]+\.[0-9]+\.([0-9]+).*$/\1/'
}

package_prerelease_tag() {
  package_version | sed -E "s#([0-9]+\.[0-9]+\.[0-9]+)(-([^.]+)(\.(.+))?)?#\3#g"
}

package_prerelease_build() {
  package_version | sed -E "s#([0-9]+\.[0-9]+\.[0-9]+)(-([^.]+)(\.(.+))?)?#\5#g"
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

npmrc() {
    if [ -n "${NPM_CONFIG_USERCONFIG}" ]; then
      npmrc_file="${NPM_CONFIG_USERCONFIG}"
    elif [ -f .npmrc ]; then
      npmrc_file="$(pwd)/.npmrc"
    else
      npmrc_file="$(npm config get userconfig)"
    fi
    if [ -n "${npmrc_file}" ] && [ -f "${npmrc_file}" ]; then
      echo "${npmrc_file}"
    fi
}

bump_version_generic() {
  version=$(package_version)
  branch=$(branch_name)
  if [ "${branch}" = "release" ]; then
    updated="$(package_version_major).$(package_version_minor).$(($(package_version_patch) + 1))"
  else
    updated="$(package_version_major).$(package_version_minor).$(package_version_patch)"
    if [ -z "${BUILD_NUMBER}" ]; then
      BUILD_NUMBER="t$(date +%s)"
    fi
    updated="${updated}-$(prerelease_tag).${BUILD_NUMBER}"
  fi
  echo "${updated}" > .version
  if [ $? -ne 0 ]; then
    echo "*** failed to bump version!"
    exit 1
  fi
  add_commit_file .version

  echo "${updated}"

}

bump_version_npm() {
  if [ "$(branch_name)" = "release" ]; then
    version=$(npm version --no-git-tag-version patch)
  else
    version=$(npm version --no-git-tag-version prerelease --preid="$(prerelease_tag)")
  fi
  if [ $? -ne 0 ]; then
    echo "*** failed to bump version!"
    exit 1
  fi
  add_commit_file package.json
  package_version
}

bump_version() {
  if [ -f package.json ]; then
    bump_version_npm
  else
    bump_version_generic
  fi
}

update_scope_npm() {

  if [ "$(package_scope)" != "$(branch_scope)" ]; then
    local new_name="@$(branch_scope)/$(package_name)"
    jq ".name = \"${new_name}\"" < package.json > package.json.tmp
    mv -f package.json.tmp package.json
    add_commit_file package.json
  fi
}

update_scope() {
# warning - bump_version removes commit filename
  if [ -f package.json ]; then
    update_scope_npm
  fi
}

extract_baseimage() {
  regex="s/FROM ([^[:space:]]*) AS ([^[:space:]]+)$/\1/p"
  if [ -f Dockerfile.src ]; then
    image=$(sed -n -E "${regex}" Dockerfile.src | envsubst)
  elif [ -f Dockerfile ]; then
    image=$(sed -n -E "${regex}" Dockerfile)
  else
    image=""
  fi
  echo "${image}"
}

platforms() {
  if [[ -f .platforms ]]; then
    supported_platforms=$(cat .platforms)
  else
    supported_platforms='linux/amd64,linux/arm64'
  fi
  echo "${supported_platforms}"
}

docker_build() {
  docker buildx build --pull --push --platform "$(platforms)" "$@"
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
  if [ "${branch}" != "release" ]; then
      tag=$(sanitize "${branch}-latest")
  fi
  echo "${tag}"
}

docker_latest() {
  echo "$(package_name):$(docker_latest_tag)"
}

is_prod_branch() {
  case $1 in
    release) :
      return 0
      ;;
    hotfix*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

docker_registry() {
  if is_prod_branch "$(branch_name)"; then
    echo "${DOCKER_PROD_REGISTRY}"
  else
    echo "${DOCKER_DEV_REGISTRY}"
  fi
}

npm_registry() {
  if is_prod_branch "$(branch_name)"; then
    echo "${NPM_PROD_REGISTRY}"
  else
    echo "${NPM_DEV_REGISTRY}"
  fi
}


docker_base_tag() {
  if is_prod_branch "$(branch_name)"; then
    echo "latest"
  else
    echo "master-latest"
  fi
}

prepare_build_phase() {
  local phase=$(basename "$0" | sed -E 's/([0-9]+)-.+.sh/\1/')
  local BUILD_LOCAL_PHASE_VAR="BUILD_LOCAL_${phase}"
  local BUILD_LOCAL_PHASE="${!BUILD_LOCAL_PHASE_VAR}"
# posix sh version:
# BUILD_LOCAL_PHASE=$(eval "echo -n \$$BUILD_LOCAL_PHASE_VAR")

  if [ -z "${BUILD_LOCAL}" ] && [ -z "${BUILD_LOCAL_PHASE}" ]; then
    env | grep -E 'NPM|DOCKER|REGISTRY|GIT|BUILD' > .env.tmp

    env_opts=(--env-file .env.tmp -e "${BUILD_LOCAL_PHASE_VAR}=true")
    vol_opts=(-v "$(project_dir):/build")
    if [ -n "$(npmrc)" ]; then
      vol_opts+=(-v "$(npmrc):/tmp/.npmrc")
      env_opts+=(-e NPM_CONFIG_USERCONFIG=/tmp/.npmrc)
    fi
    if [ -f Dockerfile ] || [ -f Dockerfile.src ]; then
      baseimage="$(DOCKER_REGISTRY=$(docker_registry) extract_baseimage)"
    else
      baseimage="$(docker_registry)/cl-alpine-20"
    fi

    echo "*** Running $(basename "$0") in $baseimage"

    docker run -t \
          -v "$(npmrc)":/tmp/.npmrc \
          "${vol_opts[@]}" \
          "${env_opts[@]}" \
          -w "$(work_dir)" \
          "${baseimage}" \
          /bin/bash -c "$(work_dir)/.build/$(basename "$0")"

    status=$?
    rm -f .env.tmp
    exit $status
  else
    echo "*** Build (architecture: $(uname -m), node: $(node --version))"
  fi
}


diff_build_scripts() {
  if [ -z "${DEVEL}" ]; then
    DEVEL="${HOME}/devel"
  fi
  for f in .build/*; do
    script="$(basename "$f")"
    echo "******** $script ********"
    diff "$f" "${DEVEL}/cl-build-scripts/$script"
  done
}

update_build_scripts() {
  if [ -z "${DEVEL}" ]; then
    DEVEL="${HOME}/devel"
  fi
  for f in .build/*; do
    script="$(basename "$f")"
    if [ -f "${DEVEL}/cl-build-scripts/$script" ]; then
      echo "copying standard $script..."
      cp -f "${DEVEL}/cl-build-scripts/$script" "$f"
      git add "$f"
    else
      echo "skipping local $script..."
    fi
  done
  echo "done!"
}

renumber_build_scripts() {
  for f in .build/*; do
    phase=$(basename "$f" | sed -E 's/([0-9]+)-.+.sh/\1/')
    script=$(basename "$f" | sed -E 's/[0-9]+-(.+).sh/\1/')
    if [ -f ".build/${phase}-${script}.sh" ] && [ $phase -lt 10 ]; then
      newphase=$(($phase * 10))
      renamed=$(printf ".build/%02d-%s.sh" $newphase $script)
      echo "renaming $f to $renamed"
      git mv "$f" "$renamed"
    else
      echo "skipping $f"
    fi
  done
}



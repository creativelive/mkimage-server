#!/bin/bash

for stage in .build/*.sh; do
  echo "==== ${stage} ===="
  (. "${stage}")
  code=$?
  if [[ $code -ne 0 ]]; then
    echo "*** exiting with code $code ***"
    exit $code
  fi
done
exit 0


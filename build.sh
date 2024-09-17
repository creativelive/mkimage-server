#!/bin/bash

for stage in .build/*.sh; do
  echo "==== ${stage} ===="
  #(. "${stage}")
  bash "${stage}"
  code=$?
  if [[ $code -ne 0 ]]; then
    echo "*** exiting with code $code ***"
    exit $code
  fi
done
echo "==== DONE ===="
exit 0


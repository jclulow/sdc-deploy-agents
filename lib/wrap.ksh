#!/bin/ksh

set -o errexit
set -o pipefail

DIR="$(cd $(dirname $(whence $0))/.. && pwd)"
NAME="$(basename $0)"

NODE="${DIR}/node/bin/node"
JS_FILE="${DIR}/cmd/${NAME}.js"

"${NODE}" "${JS_FILE}" "$@"

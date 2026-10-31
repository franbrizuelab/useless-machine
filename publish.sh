#!/bin/sh
# Builds v1, v2 and v3 into the personal site's folder for this project (sparsefocus.com/proj/useless-machine/).
# Pass a different site folder as the first argument; --cached is assumed (painter's keys from keys*.json).
set -e
cd "$(dirname "$0")"
SITE="${1:-../sparsefocus_front/proj/useless-machine}"
node build.mjs --cached "--site=$SITE"
node build.mjs --v2 --cached "--site=$SITE"
node build.mjs --v3 --cached "--site=$SITE"
echo "published to $SITE"

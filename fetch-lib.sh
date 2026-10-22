#!/bin/sh
# Downloads the pinned transformers.js release into lib/transformers-<version>/
set -e
V=3.7.1
cd "$(dirname "$0")"
TMP=$(mktemp -d)
( cd "$TMP" && npm pack "@huggingface/transformers@$V" >/dev/null && tar xzf huggingface-transformers-$V.tgz )
mkdir -p "transformers-$V"
cp "$TMP"/package/dist/transformers.min.js "transformers-$V"/
cp "$TMP"/package/dist/ort-wasm* "transformers-$V"/ 2>/dev/null || true
rm -rf "$TMP"
ls -la "transformers-$V"
echo "Done. Expected: transformers.min.js plus ort-wasm-*.mjs / *.wasm"

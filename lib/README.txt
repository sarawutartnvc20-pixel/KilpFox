KlipFox – self-hosted AI library (transformers.js)
==================================================

The subtitle / AI features load @huggingface/transformers. The app looks for it here first:

    lib/transformers-3.7.1/transformers.min.js      (+ the onnxruntime .mjs/.wasm files beside it)

How to fill this folder (run once, on a computer with Node.js, from the folder that holds index.html):

    sh lib/fetch-lib.sh

Then deploy as usual. When the local copy is in place you can stop the app from ever using the CDN:
add   <script>window.KF_LIB_CDN = false;</script>   to the <head> of index.html.

Note: the AI model files (Whisper etc., ~290 MB) are still downloaded from huggingface.co on first use.
That is data, not code, and is cached in the browser afterwards.

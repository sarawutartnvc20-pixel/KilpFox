Typhoon ASR Real-time, 8-bit  (enc.000-005 = encoder pieces, dec.000-001 = decoder + joint pieces, vocab.json = Thai BPE, 2048 tokens)
  Model: typhoon-ai/typhoon-asr-realtime (SCB 10X; FastConformer-Transducer, 115M parameters, Thai) - https://huggingface.co/typhoon-ai/typhoon-asr-realtime
  ONNX export: wannaphong/typhoon-asr-realtime-onnx (CC BY 4.0). KlipFox changes: encoder MatMul / Conv weights stored as 8-bit,
  the positional table cut to 1,500 frames (about 2 minutes), the file split into 20 MB pieces. The pieces are joined again in the app.
LICENSE: CC BY 4.0 (attribution: SCB 10X, Typhoon ASR). Using the model also requires accepting the OpenTyphoon terms and conditions
  (https://opentyphoon.ai). To switch it off: remove the "typhoon" entry from MODELS in index.html and delete this folder.

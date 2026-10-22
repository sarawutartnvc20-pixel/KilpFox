umxl-vocals.bin.gz  (13.3 MB)
  The "vocals" network of Open-Unmix UMX-L (https://github.com/sigsep/open-unmix-pytorch), 8/16-bit per-tensor
  quantised, taken from the ggml conversion in https://github.com/sevagh/free-music-demixer (models/ggml-model-umxl-u8.bin.gz,
  vocals = 4th network in that file, copied unchanged). Format: ggml-style records (see umx/extract.py in the build notes).
LICENSE: the Open-Unmix pre-trained UMX-L weights are CC BY-NC-SA 4.0 (non-commercial, share-alike, attribution:
  Stoter, Uhlich, Liutkus, Mitsufuji - "Open-Unmix for Music Source Separation", JOSS 2019). The code that runs it
  (index.html, worker) is KlipFox's own. To switch the feature off, set window.KF_NO_UMX = true and delete this folder.

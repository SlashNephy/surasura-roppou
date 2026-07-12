# tessdata（OCR 日本語モデル）

- ファイル: `jpn.traineddata`（非圧縮）
- 由来: https://github.com/tesseract-ocr/tessdata_fast （fast モデル）
- 対象言語: 日本語（横書き `jpn`）
- 取得元パス: `jpn.traineddata`
- 取得日: 2026-07-12
- サイズ: 2,471,260 bytes（`src/core/ocr/model.ts` の `MODEL_SIZE_BYTES` と一致させる）
- 用途: Tesseract.js の `langPath` として自オリジン配信する（第三者オリジンへリクエストを出さないため）。
- gzip: 配信は非圧縮（`createWorker` で `gzip: false`）。`.gz` を静的配信すると Content-Encoding による二重解凍で失敗し得るため避ける。

## 更新手順

1. 上流 `tessdata_fast` から非圧縮 `jpn.traineddata` を再取得する。
2. `wc -c` の実測値で `src/core/ocr/model.ts` の `MODEL_SIZE_BYTES` を更新する。
3. 実ブラウザで OCR 疎通を確認する。

# PWA cache strategy を Workbox generateSW で構成する

Date: 2026-07-06

## Status

Accepted

## Context

M2 では、アプリシェルを Service Worker でキャッシュし、保存済み法令を後続 issue でオフライン閲覧できる土台を作る。
現時点では法令本文の永続化は IndexedDB 側が責務を持つため、PWA キャッシュ基盤では HTML、CSS、JavaScript、manifest、icon などの app shell と静的アセットを対象にする。

## Decision

Vite の build pipeline には `vite-plugin-pwa` を追加し、Workbox の `generateSW` で Service Worker を生成する。
`registerType` は `prompt` とし、`virtual:pwa-register` の callback を `PwaUpdatePrompt` に接続して、更新可能な Service Worker がある場合にユーザー操作で reload できる導線を出す。

app shell cache は Workbox precache を使い、`js`, `css`, `html`, `ico`, `png`, `svg`, `webmanifest` を対象にする。
SPA の navigation fallback は `/index.html` とし、Service Worker 更新時に古い cache を掃除する。

## Consequences

- `pnpm run build` で `dist/sw.js` と Workbox runtime が生成され、Cloudflare Pages の静的配信だけで PWA install と app shell cache を使える。
- 更新導線は自動 reload ではなく prompt にするため、法令閲覧中に突然画面が更新されにくい。
- 保存済み法令本文の offline-first 読み出しは IndexedDB repository と後続 issue #19 の責務として分離する。
- manifest は `src/core/pwa/config.ts` を build 設定の正とし、`public/manifest.webmanifest` との一致をテストで保つ。

import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
// 表示フォント設定で選べる同梱 Web フォント。@font-face 宣言のみを読み込み、
// フォントファイル自体は選択中の書体が描画に使われたとき、使用チャンクだけ取得される。
// variable でない書体は、提供されているウェイトのうち本文・UI で使う範囲を明示的に読み込む。
import "@fontsource-variable/noto-sans-jp";
import "@fontsource-variable/noto-serif-jp";
import "@fontsource/biz-udgothic";
import "@fontsource/biz-udgothic/700.css";
import "@fontsource/biz-udmincho";
import "@fontsource/biz-udmincho/700.css";
import "@fontsource/zen-old-mincho";
import "@fontsource/zen-old-mincho/500.css";
import "@fontsource/zen-old-mincho/600.css";
import "@fontsource/zen-old-mincho/700.css";
import { DisplayPreferencesProvider } from "./app/display-preferences";
import { router } from "./app/router";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <DisplayPreferencesProvider>
      <RouterProvider router={router} />
    </DisplayPreferencesProvider>
  </StrictMode>,
);

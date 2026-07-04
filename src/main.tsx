import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <h1 className="text-2xl font-semibold">すらすら六法</h1>
      <p className="mt-3 text-sm text-zinc-600">アプリケーションの起動準備中です。</p>
    </main>
  </StrictMode>,
);

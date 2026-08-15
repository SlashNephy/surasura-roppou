import "@testing-library/jest-dom/vitest";

// jsdom は window.scrollTo を実装しておらず、呼ばれるたびに "Not implemented" を出力する。
// ルーターのスクロール位置復元が全遷移で呼ぶため、無害な no-op で置き換えて出力を保つ。
// スクロールそのものを検証するテストは src/test/scrollMocks.ts でさらに差し替える。
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => {
    // no-op
  },
  writable: true,
});

// jsdom should provide localStorage, but ensure it's available as a fallback
if (typeof localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: (() => {
      const store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete store[key];
        },
        clear: () => {
          Object.keys(store).forEach((key) => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete store[key];
          });
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
        get length() {
          return Object.keys(store).length;
        },
      };
    })(),
    writable: false,
    configurable: true,
  });
}

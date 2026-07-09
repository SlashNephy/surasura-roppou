import "@testing-library/jest-dom/vitest";

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

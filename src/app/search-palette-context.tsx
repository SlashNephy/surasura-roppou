import { createContext, useContext, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import type { QuickSearch } from "@/core/jump";

import { defaultQuickSearch } from "./quick-search";

interface SearchPaletteContextValue {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  open: () => void;
  // Task 4 で SearchPalette が候補を取得するために使う。
  // Task 3 時点では Context に保持するのみで SearchPalette からは参照しない。
  quickSearch: QuickSearch;
}

// Provider が無い場所（単体テストの一部）でも壊れないよう no-op 既定を持たせる。
// 引数を省略した関数は TypeScript 上 (open: boolean) => void に代入可能。
const SearchPaletteContext = createContext<SearchPaletteContextValue>({
  isOpen: false,
  setOpen() {
    // no-op: Provider 外からの呼び出しは無視する
  },
  open() {
    // no-op: Provider 外からの呼び出しは無視する
  },
  quickSearch: defaultQuickSearch,
});

interface SearchPaletteProviderProps {
  children: ReactNode;
  quickSearch?: QuickSearch;
}

export const SearchPaletteProvider = ({
  children,
  quickSearch = defaultQuickSearch,
}: SearchPaletteProviderProps): ReactElement => {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo<SearchPaletteContextValue>(
    () => ({
      isOpen,
      setOpen,
      open() {
        setOpen(true);
      },
      quickSearch,
    }),
    [isOpen, quickSearch],
  );

  return <SearchPaletteContext.Provider value={value}>{children}</SearchPaletteContext.Provider>;
};

export const useSearchPalette = (): SearchPaletteContextValue => useContext(SearchPaletteContext);

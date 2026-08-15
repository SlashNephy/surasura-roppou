import { useElementScrollRestoration } from "@tanstack/react-router";
import type { ParsedLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

// ルーター既定のキーは履歴エントリ単位のため、タブを押し直すたびに別エントリになり
// 位置が復元されない。URL をキーにして「同じ条文へ戻ってきたか」で判定する。
export const getScrollRestorationKey = (location: ParsedLocation): string => location.href;

/**
 * 本文が出そろってから読書位置を当て直し、復元したかどうかを返す。
 *
 * ルーターの復元は onRendered（= 本文の非同期ロード前）に走るため、そのままでは
 * ページ高さが足りずスクロール量が 0 に丸められる。本文をマウントし終えた
 * コンポーネントからこのフックを呼ぶことで、実際の高さに対して復元できる。
 */
export const useRestoredReadingPosition = (): boolean => {
  const entry = useElementScrollRestoration({
    getElement: () => window,
    getKey: getScrollRestorationKey,
  });
  // 復元後の自スクロールで entry が変化しても影響を受けないよう、マウント時点に固定する。
  const [initialEntry] = useState(() => entry);

  useEffect(() => {
    if (initialEntry === undefined) {
      return;
    }

    window.scrollTo({ left: initialEntry.scrollX, top: initialEntry.scrollY });
  }, [initialEntry]);

  return initialEntry !== undefined;
};

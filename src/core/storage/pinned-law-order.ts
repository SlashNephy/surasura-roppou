import type { PinnedLawRecord } from "./schema";

/**
 * ピン留め一覧の並び。新しくピン留めしたものが先。
 *
 * `pinnedAt` は同値になりうる（同一ミリ秒での連続操作、テストの固定時計）。
 * 同値のときの順序を索引の返却順や `Map` の挿入順に任せると、IndexedDB 実装と
 * メモリ実装で並びが食い違い、後者を使うテストが並び順のバグを隠す。
 * 両実装がこの比較関数を共有することで、順序を契約として揃える。
 */
export const comparePinnedLaws = (left: PinnedLawRecord, right: PinnedLawRecord): number =>
  left.pinnedAt === right.pinnedAt
    ? right.lawId.localeCompare(left.lawId)
    : right.pinnedAt.localeCompare(left.pinnedAt);

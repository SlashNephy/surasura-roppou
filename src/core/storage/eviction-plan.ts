export interface EvictionCandidate {
  lawId: string;
  revisionId: string;
  isCurrent: boolean;
  byteSize: number;
  updatedAt: string;
}

export interface EvictionPlan {
  revisions: { lawId: string; revisionId: string }[];
  lawIds: string[];
}

/**
 * 上限を下回るまでの削除対象を選ぶ。IO を持たない純関数にして、順序と停止条件だけを検証できるようにする。
 *
 * 2 段階で選ぶ。
 *
 * 1. 履歴版（非現行版）を `updatedAt` 昇順に落とす。ダウンロード指定の有無を問わない。
 *    指定が表明する意図は「この法令をオフラインで読めるようにしておく」ことであり、
 *    過去に覗いた版を取っておくことではない。
 * 2. それでも下回らなければ、ダウンロード指定の無い法令を丸ごと落とす。
 *
 * 第 1 段が非現行版しか消さないため、「現行版だけ消えて履歴版が残る」状態は生じない。
 *
 * 消せるものが尽きても上限を下回らないことがある（全法令がダウンロード指定済みの場合）。
 * そのときは超過を許す。上限はユーザーの意図に優先しない。
 *
 * @param candidates `updatedAt` 昇順であること。呼び出し側が索引の順序で渡す。
 */
export const planEviction = (
  candidates: EvictionCandidate[],
  pinnedLawIds: ReadonlySet<string>,
  limitBytes: number,
): EvictionPlan => {
  const plan: EvictionPlan = { revisions: [], lawIds: [] };
  let total = candidates.reduce((sum, item) => sum + item.byteSize, 0);

  if (total <= limitBytes) {
    return plan;
  }

  const deletedRevisionIds = new Set<string>();

  for (const item of candidates) {
    if (total <= limitBytes) {
      return plan;
    }

    if (item.isCurrent) {
      continue;
    }

    plan.revisions.push({ lawId: item.lawId, revisionId: item.revisionId });
    deletedRevisionIds.add(item.revisionId);
    total -= item.byteSize;
  }

  for (const item of candidates) {
    if (total <= limitBytes) {
      return plan;
    }

    // 法令単位の削除は現行版のレコードを起点にする。同じ法令を二度選ばないため。
    if (!item.isCurrent || pinnedLawIds.has(item.lawId)) {
      continue;
    }

    plan.lawIds.push(item.lawId);
    // 第 1 段で既に落とした版は差し引き済みなので数えない。
    total -= candidates
      .filter((other) => other.lawId === item.lawId && !deletedRevisionIds.has(other.revisionId))
      .reduce((sum, other) => sum + other.byteSize, 0);
  }

  return plan;
};

import type { IDBPObjectStore, StoreNames } from "idb";

import type { SurasuraDatabase } from "./schema";

// 保存経路（saveLawDocument / importSavedDataIntoDatabase）が共有する現行版スロットの操作。
// 「1 法令につき isCurrent: 1 は高々 1 件」という不変条件を 1 箇所に閉じ込めるため、
// 呼び出し側のトランザクションのストア集合に依存しないよう object store を受け取る。

type WritableStore<TName extends StoreNames<SurasuraDatabase>> = IDBPObjectStore<
  SurasuraDatabase,
  ArrayLike<StoreNames<SurasuraDatabase>>,
  TName,
  "readwrite"
>;

/**
 * `keepRevisionId` 以外の現行版レコードを履歴版（`isCurrent: 0`）へ降格する。
 * レコードもノードも消さない。`updatedAt` は「最後に書いた時刻」として PR 3 の LRU が使うため据え置く。
 */
export const demoteOtherCurrentRevisions = async (
  savedLaws: WritableStore<"savedLaws">,
  lawId: string,
  keepRevisionId: string,
): Promise<void> => {
  const currentRecords = await savedLaws.index("by-law-current").getAll([lawId, 1]);

  for (const record of currentRecords) {
    if (record.revisionId === keepRevisionId) {
      continue;
    }

    await savedLaws.put({ ...record, isCurrent: 0 });
  }
};

/**
 * 指定した版のノードをすべて削除する。書き込み前に必ず呼び、同じ版を入れ直す。
 * これを怠ると、ローカルにあって新しい本文に無いノードが残留し `nodeCount` と実件数がずれる。
 * 他の版のノードには触れない（版をまたぐ削除はエビクションの責務）。
 */
export const deleteRevisionNodes = async (
  lawNodes: WritableStore<"lawNodes">,
  lawId: string,
  revisionId: string,
): Promise<void> => {
  const nodeKeys = await lawNodes.index("by-law-revision").getAllKeys([lawId, revisionId]);

  await Promise.all(nodeKeys.map((key) => lawNodes.delete(key)));
};

import type { IDBPDatabase } from "idb";

import { fixedIntervalScheduler } from "@/core/study";

import type { SavedDataExport } from "./export-data";
import { countSavedData, type SavedDataImportResult } from "./import-data";
import type { SurasuraDatabase } from "./schema";
import { withTargetIndexes } from "./stored-record";

const importStoreNames = [
  "laws",
  "lawRevisions",
  "lawNodes",
  "savedLaws",
  "bookmarks",
  "collections",
  "annotations",
  "studyCards",
  "reviewLogs",
  "cardSchedules",
  "studySessions",
] as const;

export const importSavedDataIntoDatabase = async (
  database: IDBPDatabase<SurasuraDatabase>,
  data: SavedDataExport,
  importedAt: string,
): Promise<SavedDataImportResult> => {
  // 本文から導出スケジュールまで同じトランザクションに含め、途中失敗時に部分 import を残さない。
  const transaction = database.transaction(importStoreNames, "readwrite");

  try {
    const laws = transaction.objectStore("laws");
    const lawRevisions = transaction.objectStore("lawRevisions");
    const lawNodes = transaction.objectStore("lawNodes");
    const savedLaws = transaction.objectStore("savedLaws");
    const reviewLogs = transaction.objectStore("reviewLogs");
    const cardSchedules = transaction.objectStore("cardSchedules");

    for (const savedLaw of data.savedLaws) {
      const lawId = savedLaw.law.lawId;
      const existingSavedLaw = await savedLaws.get(lawId);

      if (existingSavedLaw !== undefined) {
        const existingNodeKeys = await lawNodes
          .index("by-law-revision")
          .getAllKeys([lawId, existingSavedLaw.revisionId]);

        await Promise.all(existingNodeKeys.map((key) => lawNodes.delete(key)));

        if (existingSavedLaw.revisionId !== savedLaw.revision.revisionId) {
          await lawRevisions.delete(existingSavedLaw.revisionId);
        }
      }

      // 大量の法令ノードを1件ずつ完了待ちせず、同じ transaction の request queue へまとめて渡す。
      await Promise.all([
        laws.put(savedLaw.law),
        lawRevisions.put(savedLaw.revision),
        ...savedLaw.nodes.map((node, sortOrder) =>
          lawNodes.put({
            id: node.id,
            lawId: node.lawId,
            revisionId: node.revisionId,
            sortOrder,
            node,
          }),
        ),
        savedLaws.put({
          lawId,
          revisionId: savedLaw.revision.revisionId,
          nodeCount: savedLaw.nodes.length,
          savedAt: savedLaw.savedAt,
          updatedAt: importedAt,
        }),
      ]);
    }

    const affectedCardIds = new Set(data.studyCards.map((card) => card.id));

    await Promise.all([
      ...data.bookmarks.map((bookmark) =>
        transaction.objectStore("bookmarks").put(withTargetIndexes(bookmark)),
      ),
      ...data.collections.map((collection) =>
        transaction.objectStore("collections").put(collection),
      ),
      ...data.annotations.map((annotation) =>
        transaction.objectStore("annotations").put(withTargetIndexes(annotation)),
      ),
      ...data.studyCards.map((card) =>
        transaction.objectStore("studyCards").put(withTargetIndexes(card)),
      ),
      ...data.studySessions.map((session) => transaction.objectStore("studySessions").put(session)),
    ]);

    const previousReviewLogs = await Promise.all(
      data.reviewLogs.map((log) => reviewLogs.get(log.id)),
    );

    for (const [index, log] of data.reviewLogs.entries()) {
      const previous = previousReviewLogs[index];

      if (previous !== undefined) {
        affectedCardIds.add(previous.cardId);
      }

      affectedCardIds.add(log.cardId);
    }
    await Promise.all(data.reviewLogs.map((log) => reviewLogs.put(log)));

    const historiesByCardId = await Promise.all(
      [...affectedCardIds].map(async (cardId) => ({
        cardId,
        history: await reviewLogs.index("by-card-id").getAll(cardId),
      })),
    );

    await Promise.all(
      historiesByCardId.map(({ cardId, history }) =>
        history.length === 0
          ? cardSchedules.delete(cardId)
          : cardSchedules.put(fixedIntervalScheduler(history, new Date(importedAt))),
      ),
    );

    await transaction.done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // request failure で既に abort 済みの場合がある。cleanup 例外で最初の request / scheduler error を隠さない。
    }

    // abort 完了の reject を観測し、元の書き込み例外だけを呼び出し元へ返す。
    await transaction.done.catch(() => undefined);
    throw error;
  }

  return {
    importedAt,
    counts: countSavedData(data),
  };
};

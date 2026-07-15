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

        for (const key of existingNodeKeys) {
          await lawNodes.delete(key);
        }

        if (existingSavedLaw.revisionId !== savedLaw.revision.revisionId) {
          await lawRevisions.delete(existingSavedLaw.revisionId);
        }
      }

      await laws.put(savedLaw.law);
      await lawRevisions.put(savedLaw.revision);

      for (const [sortOrder, node] of savedLaw.nodes.entries()) {
        await lawNodes.put({
          id: node.id,
          lawId: node.lawId,
          revisionId: node.revisionId,
          sortOrder,
          node,
        });
      }

      await savedLaws.put({
        lawId,
        revisionId: savedLaw.revision.revisionId,
        nodeCount: savedLaw.nodes.length,
        savedAt: savedLaw.savedAt,
        updatedAt: importedAt,
      });
    }

    for (const bookmark of data.bookmarks) {
      await transaction.objectStore("bookmarks").put(withTargetIndexes(bookmark));
    }

    for (const collection of data.collections) {
      await transaction.objectStore("collections").put(collection);
    }

    for (const annotation of data.annotations) {
      await transaction.objectStore("annotations").put(withTargetIndexes(annotation));
    }

    const affectedCardIds = new Set(data.studyCards.map((card) => card.id));

    for (const card of data.studyCards) {
      await transaction.objectStore("studyCards").put(withTargetIndexes(card));
    }

    for (const session of data.studySessions) {
      await transaction.objectStore("studySessions").put(session);
    }

    for (const log of data.reviewLogs) {
      const previous = await reviewLogs.get(log.id);

      if (previous !== undefined) {
        affectedCardIds.add(previous.cardId);
      }

      affectedCardIds.add(log.cardId);
      await reviewLogs.put(log);
    }

    for (const cardId of affectedCardIds) {
      const history = await reviewLogs.index("by-card-id").getAll(cardId);

      if (history.length === 0) {
        await cardSchedules.delete(cardId);
      } else {
        await cardSchedules.put(fixedIntervalScheduler(history, new Date(importedAt)));
      }
    }

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

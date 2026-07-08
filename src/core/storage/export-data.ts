import type {
  Annotation,
  Bookmark,
  Collection,
  ISODateString,
  StudyCard,
  StudySession,
} from "@/core/domain";

import type { SavedLawDocument, StorageRepository } from "./repository";

export interface SavedDataExport {
  version: 1;
  exportedAt: ISODateString;
  savedLaws: SavedLawDocument[];
  bookmarks: Bookmark[];
  collections: Collection[];
  annotations: Annotation[];
  studyCards: StudyCard[];
  studySessions: StudySession[];
}

// listDueStudyCards は指定日時以前のカードを返すため、遠い未来の日時で全カードを取得する。
const allDueStudyCardsDate = "9999-12-31T23:59:59.999Z";

export const createSavedDataExport = async (
  repository: StorageRepository,
  exportedAt: ISODateString,
): Promise<SavedDataExport> => {
  const [savedLawSummaries, bookmarks, collections, annotations, studyCards, studySessions] =
    await Promise.all([
      repository.listSavedLaws(),
      repository.listBookmarks(),
      repository.listCollections(),
      repository.listAnnotations(),
      repository.listDueStudyCards(allDueStudyCardsDate),
      repository.listStudySessions(),
    ]);
  const savedLawDocuments: SavedLawDocument[] = [];
  for (const savedLaw of savedLawSummaries) {
    try {
      const document = await repository.getLawDocument(savedLaw.law.lawId);

      if (document !== undefined) {
        savedLawDocuments.push(document);
      }
    } catch {
      // 壊れた保存本文はスキップし、ブックマークなど他の利用者データを優先して出力する。
    }
  }

  return {
    annotations,
    bookmarks,
    collections,
    exportedAt,
    savedLaws: savedLawDocuments,
    studyCards,
    studySessions,
    version: 1,
  };
};

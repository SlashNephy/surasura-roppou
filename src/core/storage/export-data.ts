import type {
  Annotation,
  Bookmark,
  Collection,
  ISODateString,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";

import type { SavedLawDocument, StorageRepository } from "./repository";

export interface SavedDataExport {
  version: 2;
  exportedAt: ISODateString;
  savedLaws: SavedLawDocument[];
  bookmarks: Bookmark[];
  collections: Collection[];
  annotations: Annotation[];
  studyCards: StudyCard[];
  // 回答履歴を含めることで、端末移行後も任意のスケジューラで状態を再構築できる。
  // CardSchedule は導出キャッシュなので含めない（import 後に再計算する）。
  reviewLogs: ReviewLog[];
  studySessions: StudySession[];
}

export const createSavedDataExport = async (
  repository: StorageRepository,
  exportedAt: ISODateString,
): Promise<SavedDataExport> => {
  const [
    savedLawSummaries,
    bookmarks,
    collections,
    annotations,
    studyCards,
    reviewLogs,
    studySessions,
  ] = await Promise.all([
    repository.listSavedLaws(),
    repository.listBookmarks(),
    repository.listCollections(),
    repository.listAnnotations(),
    repository.listStudyCards(),
    repository.listReviewLogs(),
    repository.listStudySessions(),
  ]);
  const savedLawDocuments: SavedLawDocument[] = [];
  for (const savedLaw of savedLawSummaries) {
    const document = await repository.getLawDocument(savedLaw.law.lawId);

    if (document === undefined) {
      throw new Error(`Saved law document is unavailable: ${savedLaw.law.lawId}`);
    }

    savedLawDocuments.push(document);
  }

  return {
    annotations,
    bookmarks,
    collections,
    exportedAt,
    savedLaws: savedLawDocuments,
    studyCards,
    reviewLogs,
    studySessions,
    version: 2,
  };
};

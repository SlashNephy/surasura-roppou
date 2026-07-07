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
  const savedLawDocuments = await Promise.all(
    savedLawSummaries.map((savedLaw) => repository.getLawDocument(savedLaw.law.lawId)),
  );

  return {
    annotations,
    bookmarks,
    collections,
    exportedAt,
    savedLaws: savedLawDocuments.filter(
      (document): document is SavedLawDocument => document !== undefined,
    ),
    studyCards,
    studySessions,
    version: 1,
  };
};

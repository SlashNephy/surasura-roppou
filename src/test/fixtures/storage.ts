import { vi } from "vitest";

import type {
  Annotation,
  Bookmark,
  Collection,
  OcrSession,
  StudyCard,
  StudySession,
} from "@/core/domain";
import type {
  LawDocumentInput,
  SavedLawDocument,
  SavedLawSummary,
  StorageRepository,
} from "@/core/storage";

export const createMemoryStorageRepository = (
  initialDocumentOrOptions?: SavedLawDocument | MemoryStorageRepositoryOptions,
): {
  getSavedDocument(): SavedLawDocument | undefined;
  getBookmarks(): Bookmark[];
  getCollections(): Collection[];
  getAnnotations(): Annotation[];
  getStudyCards(): StudyCard[];
  getStudySessions(): StudySession[];
  repository: StorageRepository;
} => {
  const options: MemoryStorageRepositoryOptions =
    initialDocumentOrOptions === undefined || "law" in initialDocumentOrOptions
      ? { savedLawDocument: initialDocumentOrOptions }
      : initialDocumentOrOptions;
  const initialDocument = options.savedLawDocument;
  let annotations = [...(options.annotations ?? [])];
  let bookmarks = [...(options.bookmarks ?? [])];
  let collections = [...(options.collections ?? [])];
  let studyCards = [...(options.studyCards ?? [])];
  let studySessions = [...(options.studySessions ?? [])];
  let savedDocument = initialDocument;
  let savedAt = initialDocument?.savedAt;
  let updatedAt = initialDocument?.revision.fetchedAt ?? initialDocument?.savedAt;

  return {
    getSavedDocument() {
      return savedDocument;
    },
    getBookmarks() {
      return bookmarks;
    },
    getCollections() {
      return collections;
    },
    getAnnotations() {
      return annotations;
    },
    getStudyCards() {
      return studyCards;
    },
    getStudySessions() {
      return studySessions;
    },
    repository: {
      saveLawDocument(document) {
        const nextSavedAt = savedAt ?? document.revision.fetchedAt;
        savedAt = nextSavedAt;
        updatedAt = document.revision.fetchedAt;
        savedDocument = { ...document, savedAt: nextSavedAt };
        return Promise.resolve();
      },
      getLawDocument(lawId) {
        return Promise.resolve(savedDocument?.law.lawId === lawId ? savedDocument : undefined);
      },
      listSavedLaws() {
        if (savedDocument === undefined || savedAt === undefined || updatedAt === undefined) {
          return Promise.resolve([]);
        }

        return Promise.resolve([
          {
            law: savedDocument.law,
            revision: savedDocument.revision,
            nodeCount: savedDocument.nodes.length,
            savedAt,
            updatedAt,
          },
        ]);
      },
      deleteLawDocument(lawId) {
        if (savedDocument?.law.lawId === lawId) {
          savedDocument = undefined;
          savedAt = undefined;
          updatedAt = undefined;
        }
        return Promise.resolve();
      },
      putBookmark(bookmark) {
        bookmarks = [
          ...bookmarks.filter((existingBookmark) => existingBookmark.id !== bookmark.id),
          bookmark,
        ];
        return Promise.resolve();
      },
      listBookmarks(query) {
        const filteredBookmarks =
          query?.lawId === undefined
            ? bookmarks
            : bookmarks.filter((bookmark) => bookmark.target.lawId === query.lawId);

        return Promise.resolve(filteredBookmarks);
      },
      putCollection(collection) {
        collections = [
          ...collections.filter((existingCollection) => existingCollection.id !== collection.id),
          collection,
        ];
        return Promise.resolve();
      },
      listCollections() {
        return Promise.resolve(collections);
      },
      putAnnotation(annotation) {
        annotations = [
          ...annotations.filter((existingAnnotation) => existingAnnotation.id !== annotation.id),
          annotation,
        ];
        return Promise.resolve();
      },
      listAnnotations(query) {
        const filteredAnnotations =
          query?.lawId === undefined
            ? annotations
            : annotations.filter((annotation) => annotation.target.lawId === query.lawId);

        return Promise.resolve(filteredAnnotations);
      },
      putStudyCard(card) {
        studyCards = [...studyCards.filter((existingCard) => existingCard.id !== card.id), card];
        return Promise.resolve();
      },
      listDueStudyCards(dueAtOrBefore) {
        return Promise.resolve(studyCards.filter((card) => card.dueAt <= dueAtOrBefore));
      },
      putStudySession(session) {
        studySessions = [
          ...studySessions.filter((existingSession) => existingSession.id !== session.id),
          session,
        ];
        return Promise.resolve();
      },
      listStudySessions() {
        return Promise.resolve(studySessions);
      },
      putOcrSession: vi.fn<(session: OcrSession) => Promise<void>>(),
      listOcrSessions: vi.fn<() => Promise<OcrSession[]>>(() => Promise.resolve([])),
      close: vi.fn<() => Promise<void>>(),
    },
  };
};

interface MemoryStorageRepositoryOptions {
  savedLawDocument?: SavedLawDocument;
  annotations?: Annotation[];
  bookmarks?: Bookmark[];
  collections?: Collection[];
  studyCards?: StudyCard[];
  studySessions?: StudySession[];
}

export const createSavedLawDocument = ({
  law,
  nodes,
  revision,
  savedAt = "2026-07-06T00:00:00.000Z",
}: LawDocumentInput & { savedAt?: string }): SavedLawDocument => ({
  law,
  revision,
  nodes,
  savedAt,
});

export const createSavedLawSummary = ({
  law,
  nodes,
  revision,
  savedAt = "2026-07-06T00:00:00.000Z",
  updatedAt = "2026-07-06T00:00:00.000Z",
}: LawDocumentInput & {
  savedAt?: string;
  updatedAt?: string;
}): SavedLawSummary => ({
  law,
  revision,
  nodeCount: nodes.length,
  savedAt,
  updatedAt,
});

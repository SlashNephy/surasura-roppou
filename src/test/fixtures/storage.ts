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
  repository: StorageRepository;
} => {
  const initialDocument =
    initialDocumentOrOptions === undefined || "law" in initialDocumentOrOptions
      ? initialDocumentOrOptions
      : initialDocumentOrOptions.savedLawDocument;
  let bookmarks =
    initialDocumentOrOptions === undefined || "law" in initialDocumentOrOptions
      ? []
      : [...(initialDocumentOrOptions.bookmarks ?? [])];
  let collections =
    initialDocumentOrOptions === undefined || "law" in initialDocumentOrOptions
      ? []
      : [...(initialDocumentOrOptions.collections ?? [])];
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
      listBookmarks() {
        return Promise.resolve(bookmarks);
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
      putAnnotation: vi.fn<(annotation: Annotation) => Promise<void>>(),
      listAnnotations: vi.fn<() => Promise<Annotation[]>>(() => Promise.resolve([])),
      putStudyCard: vi.fn<(card: StudyCard) => Promise<void>>(),
      listDueStudyCards: vi.fn<() => Promise<StudyCard[]>>(() => Promise.resolve([])),
      putStudySession: vi.fn<(session: StudySession) => Promise<void>>(),
      listStudySessions: vi.fn<() => Promise<StudySession[]>>(() => Promise.resolve([])),
      putOcrSession: vi.fn<(session: OcrSession) => Promise<void>>(),
      listOcrSessions: vi.fn<() => Promise<OcrSession[]>>(() => Promise.resolve([])),
      close: vi.fn<() => Promise<void>>(),
    },
  };
};

interface MemoryStorageRepositoryOptions {
  savedLawDocument?: SavedLawDocument;
  bookmarks?: Bookmark[];
  collections?: Collection[];
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

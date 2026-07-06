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
  initialDocument?: SavedLawDocument,
): {
  getSavedDocument(): SavedLawDocument | undefined;
  repository: StorageRepository;
} => {
  let savedDocument = initialDocument;
  let savedAt = initialDocument?.savedAt;
  let updatedAt = initialDocument?.revision.fetchedAt ?? initialDocument?.savedAt;

  return {
    getSavedDocument() {
      return savedDocument;
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
      putBookmark: vi.fn<(bookmark: Bookmark) => Promise<void>>(),
      listBookmarks: vi.fn<() => Promise<Bookmark[]>>(() => Promise.resolve([])),
      putCollection: vi.fn<(collection: Collection) => Promise<void>>(),
      listCollections: vi.fn<() => Promise<Collection[]>>(() => Promise.resolve([])),
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

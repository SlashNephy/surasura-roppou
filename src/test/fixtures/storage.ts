import { vi } from "vitest";

import type {
  Annotation,
  Bookmark,
  CardSchedule,
  Collection,
  OcrSession,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";
import { fixedIntervalScheduler } from "@/core/study";
import {
  countSavedData,
  type SavedDataExport,
  type SavedDataImportResult,
  DueStudyCard,
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
  getReviewLogs(): ReviewLog[];
  getCardSchedules(): CardSchedule[];
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
  let reviewLogs = [...(options.reviewLogs ?? [])];
  let cardSchedules = [...(options.cardSchedules ?? [])];
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
    getReviewLogs() {
      return reviewLogs;
    },
    getCardSchedules() {
      return cardSchedules;
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
      getStudyCard(cardId) {
        return Promise.resolve(studyCards.find((card) => card.id === cardId));
      },
      deleteStudyCard(cardId) {
        studyCards = studyCards.filter((card) => card.id !== cardId);
        reviewLogs = reviewLogs.filter((log) => log.cardId !== cardId);
        cardSchedules = cardSchedules.filter((schedule) => schedule.cardId !== cardId);
        return Promise.resolve();
      },
      recordReview(log) {
        reviewLogs = [...reviewLogs.filter((existingLog) => existingLog.id !== log.id), log];

        const schedule = fixedIntervalScheduler(
          reviewLogs.filter((candidate) => candidate.cardId === log.cardId),
          new Date(log.reviewedAt),
        );

        cardSchedules = [
          ...cardSchedules.filter((existingSchedule) => existingSchedule.cardId !== log.cardId),
          schedule,
        ];
        return Promise.resolve(schedule);
      },
      listStudyCards(query) {
        const filteredCards =
          query?.lawId === undefined
            ? studyCards
            : studyCards.filter((card) => card.target.lawId === query.lawId);

        return Promise.resolve(filteredCards);
      },
      listDueStudyCards(dueAtOrBefore) {
        const dueCards: DueStudyCard[] = cardSchedules
          .filter((schedule) => schedule.dueAt <= dueAtOrBefore)
          .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
          .flatMap((schedule) => {
            const card = studyCards.find((candidate) => candidate.id === schedule.cardId);

            return card === undefined ? [] : [{ card, schedule }];
          });

        return Promise.resolve(dueCards);
      },
      listUnscheduledStudyCards() {
        const scheduled = new Set(cardSchedules.map((schedule) => schedule.cardId));

        return Promise.resolve(
          studyCards
            .filter((card) => !scheduled.has(card.id))
            .sort((left, right) =>
              left.createdAt === right.createdAt
                ? left.id.localeCompare(right.id)
                : left.createdAt.localeCompare(right.createdAt),
            ),
        );
      },
      listReviewLogs(cardId) {
        const filteredLogs =
          cardId === undefined ? reviewLogs : reviewLogs.filter((log) => log.cardId === cardId);

        return Promise.resolve(filteredLogs);
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
      importSavedData(data: SavedDataExport) {
        const nextAnnotations = mergeById(annotations, data.annotations);
        const nextBookmarks = mergeById(bookmarks, data.bookmarks);
        const nextCollections = mergeById(collections, data.collections);
        const nextStudyCards = mergeById(studyCards, data.studyCards);
        const nextStudySessions = mergeById(studySessions, data.studySessions);
        const previousLogsById = new Map(reviewLogs.map((log) => [log.id, log]));
        const affectedCardIds = new Set(data.studyCards.map((card) => card.id));

        for (const log of data.reviewLogs) {
          const previous = previousLogsById.get(log.id);

          if (previous !== undefined) {
            affectedCardIds.add(previous.cardId);
          }

          affectedCardIds.add(log.cardId);
        }

        const nextReviewLogs = mergeById(reviewLogs, data.reviewLogs);
        const rebuiltSchedules = [...affectedCardIds].flatMap((cardId) => {
          const history = nextReviewLogs.filter((log) => log.cardId === cardId);

          return history.length === 0
            ? []
            : [fixedIntervalScheduler(history, new Date(data.exportedAt))];
        });
        const nextCardSchedules = [
          ...cardSchedules.filter((schedule) => !affectedCardIds.has(schedule.cardId)),
          ...rebuiltSchedules,
        ];
        let nextSavedDocument = savedDocument;
        let nextSavedAt = savedAt;
        let nextUpdatedAt = updatedAt;

        if (data.savedLaws.length > 0) {
          const importedDocument = data.savedLaws[0];
          nextSavedDocument = importedDocument;
          nextSavedAt = importedDocument.savedAt;
          nextUpdatedAt = data.exportedAt;
        }

        const result = {
          importedAt: data.exportedAt,
          counts: countSavedData(data),
        } satisfies SavedDataImportResult;

        annotations = nextAnnotations;
        bookmarks = nextBookmarks;
        collections = nextCollections;
        studyCards = nextStudyCards;
        studySessions = nextStudySessions;
        reviewLogs = nextReviewLogs;
        cardSchedules = nextCardSchedules;
        savedDocument = nextSavedDocument;
        savedAt = nextSavedAt;
        updatedAt = nextUpdatedAt;

        return Promise.resolve(result);
      },
      putOcrSession: vi.fn<(session: OcrSession) => Promise<void>>(),
      listOcrSessions: vi.fn<() => Promise<OcrSession[]>>(() => Promise.resolve([])),
      close: vi.fn<() => Promise<void>>(),
    },
  };
};

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
  const merged = new Map(existing.map((record) => [record.id, record]));

  for (const record of incoming) {
    merged.set(record.id, record);
  }

  return [...merged.values()];
};

interface MemoryStorageRepositoryOptions {
  savedLawDocument?: SavedLawDocument;
  annotations?: Annotation[];
  bookmarks?: Bookmark[];
  collections?: Collection[];
  studyCards?: StudyCard[];
  studySessions?: StudySession[];
  reviewLogs?: ReviewLog[];
  cardSchedules?: CardSchedule[];
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

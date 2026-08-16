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
  comparePinnedLaws,
  countSavedData,
  type SavedDataExport,
  type SavedDataImportResult,
  DueStudyCard,
  LawDocumentInput,
  PinnedLawRecord,
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
  // 実リポジトリと同じく保存時刻は注入された時計から採る。既定を固定値にしているのは、
  // 時刻を注入しないテストの savedAt / updatedAt を決定的に保つため。
  // 保存のたびに時刻が進む振る舞いを検証したいテストは now を渡す。
  const now = options.now ?? (() => new Date(defaultMemoryStorageClock));
  let annotations = [...(options.annotations ?? [])];
  let bookmarks = [...(options.bookmarks ?? [])];
  let collections = [...(options.collections ?? [])];
  let studyCards = [...(options.studyCards ?? [])];
  let studySessions = [...(options.studySessions ?? [])];
  let reviewLogs = [...(options.reviewLogs ?? [])];
  let cardSchedules = [...(options.cardSchedules ?? [])];
  // IndexedDB 実装と同じく [lawId, revisionId] を複合キーにして版を共存させる。
  // 現行版スロット（1 法令につき isCurrent な版は高々 1 件）もここで再現する。
  const savedRevisions = new Map<string, MemorySavedRevision>();
  const pinnedLaws = new Map<string, PinnedLawRecord>();

  if (initialDocument !== undefined) {
    savedRevisions.set(
      toRevisionKey(initialDocument.law.lawId, initialDocument.revision.revisionId),
      {
        document: initialDocument,
        isCurrent: true,
        savedAt: initialDocument.savedAt,
        updatedAt: initialDocument.revision.fetchedAt,
      },
    );
  }

  const findCurrentRevision = (lawId: string): MemorySavedRevision | undefined =>
    [...savedRevisions.values()].find(
      (entry) => entry.isCurrent && entry.document.law.lawId === lawId,
    );
  const demoteOtherCurrentRevisions = (lawId: string, keepRevisionId: string): void => {
    for (const [key, entry] of savedRevisions) {
      if (
        entry.isCurrent &&
        entry.document.law.lawId === lawId &&
        entry.document.revision.revisionId !== keepRevisionId
      ) {
        savedRevisions.set(key, { ...entry, isCurrent: false });
      }
    }
  };
  // 新しく保存したものが先。savedAt が同値のときは revisionId 降順で決定的にする。
  const byNewestFirst = (left: MemorySavedRevision, right: MemorySavedRevision): number =>
    left.savedAt === right.savedAt
      ? right.document.revision.revisionId.localeCompare(left.document.revision.revisionId)
      : right.savedAt.localeCompare(left.savedAt);

  return {
    getSavedDocument() {
      return [...savedRevisions.values()].find((entry) => entry.isCurrent)?.document;
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
      saveLawDocument(document, options) {
        const lawId = document.law.lawId;
        const revisionId = document.revision.revisionId;
        const key = toRevisionKey(lawId, revisionId);
        const existing = savedRevisions.get(key);
        // その法令に現行版が 1 件も無いなら、基準日指定の保存でも空きスロットを埋める。
        // 実リポジトリと同じ契約（既存の現行版は奪わない）を再現する。
        const hasAnyCurrentRevision = findCurrentRevision(lawId) !== undefined;
        // 既に現行版として保存済みの版は、基準日指定の取得で降格させない。
        const isCurrent =
          (options?.isCurrent ?? true) || (existing?.isCurrent ?? false) || !hasAnyCurrentRevision;
        // savedAt はその版を初めて保存した時刻。再保存では updatedAt だけが進む。
        const writtenAt = now().toISOString();
        const nextSavedAt = existing?.savedAt ?? writtenAt;

        if (isCurrent) {
          demoteOtherCurrentRevisions(lawId, revisionId);
        }

        savedRevisions.set(key, {
          document: { ...document, savedAt: nextSavedAt },
          isCurrent,
          savedAt: nextSavedAt,
          updatedAt: writtenAt,
        });
        return Promise.resolve({ isCurrent });
      },
      getLawDocument(lawId) {
        return Promise.resolve(findCurrentRevision(lawId)?.document);
      },
      getLawDocumentRevision(lawId, revisionId) {
        return Promise.resolve(savedRevisions.get(toRevisionKey(lawId, revisionId))?.document);
      },
      listSavedLaws() {
        return Promise.resolve(
          [...savedRevisions.values()]
            .filter((entry) => entry.isCurrent)
            .sort(byNewestFirst)
            .map((entry) => ({
              law: entry.document.law,
              revision: entry.document.revision,
              nodeCount: entry.document.nodes.length,
              savedAt: entry.savedAt,
              updatedAt: entry.updatedAt,
            })),
        );
      },
      listSavedRevisions(lawId) {
        return Promise.resolve(
          [...savedRevisions.values()]
            .filter((entry) => entry.document.law.lawId === lawId)
            .sort(byNewestFirst)
            .map((entry) => ({
              revision: entry.document.revision,
              isCurrent: entry.isCurrent,
              nodeCount: entry.document.nodes.length,
              savedAt: entry.savedAt,
              updatedAt: entry.updatedAt,
            })),
        );
      },
      deleteLawDocument(lawId) {
        for (const [key, entry] of savedRevisions) {
          if (entry.document.law.lawId === lawId) {
            savedRevisions.delete(key);
          }
        }
        return Promise.resolve();
      },
      deleteLawRevision(lawId, revisionId) {
        savedRevisions.delete(toRevisionKey(lawId, revisionId));
        return Promise.resolve();
      },
      pinLaw(lawId) {
        // 既にピン留めされているなら pinnedAt を据え置く（実リポジトリと同じ契約）。
        if (!pinnedLaws.has(lawId)) {
          pinnedLaws.set(lawId, { lawId, pinnedAt: now().toISOString() });
        }
        return Promise.resolve();
      },
      unpinLaw(lawId) {
        pinnedLaws.delete(lawId);
        return Promise.resolve();
      },
      isLawPinned(lawId) {
        return Promise.resolve(pinnedLaws.has(lawId));
      },
      listPinnedLaws() {
        // 並びは実リポジトリと共有の比較関数に委ねる。ここで書き下すと契約が二重定義になる。
        return Promise.resolve([...pinnedLaws.values()].sort(comparePinnedLaws));
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
        // 実装と対称に、インポート対象の版を現行版として入れ、旧現行版は履歴として降格する。
        for (const importedDocument of data.savedLaws) {
          const lawId = importedDocument.law.lawId;
          const revisionId = importedDocument.revision.revisionId;

          demoteOtherCurrentRevisions(lawId, revisionId);
          savedRevisions.set(toRevisionKey(lawId, revisionId), {
            document: importedDocument,
            isCurrent: true,
            savedAt: importedDocument.savedAt,
            updatedAt: data.exportedAt,
          });
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

        return Promise.resolve(result);
      },
      putOcrSession: vi.fn<(session: OcrSession) => Promise<void>>(),
      listOcrSessions: vi.fn<() => Promise<OcrSession[]>>(() => Promise.resolve([])),
      close: vi.fn<() => Promise<void>>(),
    },
  };
};

// メモリ実装が保持する 1 版分のレコード。IndexedDB の savedLaws レコードに対応する。
interface MemorySavedRevision {
  document: SavedLawDocument;
  isCurrent: boolean;
  savedAt: string;
  updatedAt: string;
}

// Map のキーで [lawId, revisionId] の複合キーを表現する。区切りは ID に現れない文字を使う。
const toRevisionKey = (lawId: string, revisionId: string): string => `${lawId} ${revisionId}`;

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
  const merged = new Map(existing.map((record) => [record.id, record]));

  for (const record of incoming) {
    merged.set(record.id, record);
  }

  return [...merged.values()];
};

// 時刻を注入しないときの既定。createSavedLawDocument の既定 savedAt と揃えている。
const defaultMemoryStorageClock = "2026-07-06T00:00:00.000Z";

interface MemoryStorageRepositoryOptions {
  savedLawDocument?: SavedLawDocument;
  // 保存時刻の供給源。実リポジトリの StorageRepositoryOptions.now と同じ役割。
  now?: () => Date;
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

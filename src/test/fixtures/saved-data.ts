import type { SavedDataExport } from "@/core/storage";

export const createSavedDataExportFixture = (): SavedDataExport => {
  const lawId = "129AC0000000089";
  const revisionId = "129AC0000000089_20260624_508AC0000000045";
  const studyCardId = "study-card-civil-code-1";
  const studySessionId = "study-session-civil-code-1";
  const bookmarkId = "bookmark-civil-code-1";

  return {
    version: 2,
    exportedAt: "2026-07-15T00:00:00.000Z",
    savedLaws: [
      {
        law: {
          lawId,
          title: "民法",
          lawNumber: "明治二十九年法律第八十九号",
          lawType: "Act",
          aliases: ["民法典"],
          source: "egov",
          updatedAt: "2026-06-24T00:00:00.000Z",
        },
        revision: {
          lawId,
          revisionId,
          asOf: "2026-07-15",
          effectiveDate: "2026-06-24",
          fetchedAt: "2026-07-14T00:00:00.000Z",
          sourceUrl: `https://laws.e-gov.go.jp/law/${lawId}`,
        },
        nodes: [
          {
            id: "civil-code-article-1",
            lawId,
            revisionId,
            type: "Article",
            path: "Article/1",
            number: "1",
            title: "第一条",
            caption: "基本原則",
            rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
            plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
            normalizedText: "第一条 私権は 公共の福祉に適合しなければならない",
            children: [],
          },
        ],
        savedAt: "2026-07-14T01:00:00.000Z",
      },
    ],
    bookmarks: [
      {
        id: bookmarkId,
        target: {
          lawId,
          revisionId,
          article: "1",
          paragraph: null,
          item: null,
          path: "Article/1",
          fingerprint: "sha256:civil-code-article-1",
          pinned: true,
        },
        title: "民法1条",
        note: "私権の基本原則",
        tags: ["民法", "総則"],
        color: "amber",
        createdAt: "2026-07-14T02:00:00.000Z",
        updatedAt: "2026-07-14T02:30:00.000Z",
      },
    ],
    collections: [
      {
        id: "collection-civil-code-general",
        title: "民法総則",
        description: "民法総則の重要条文",
        bookmarkIds: [bookmarkId],
        createdAt: "2026-07-14T03:00:00.000Z",
        updatedAt: "2026-07-14T03:30:00.000Z",
      },
    ],
    annotations: [
      {
        id: "annotation-civil-code-1",
        target: {
          lawId,
          revisionId,
          article: "1",
          path: "Article/1",
          fingerprint: "sha256:civil-code-article-1",
          pinned: false,
        },
        targetText: "私権は、公共の福祉に適合しなければならない。",
        prefixText: "第一条　",
        suffixText: "",
        note: "公共の福祉による制約を確認する。",
        tags: ["基本原則"],
        createdAt: "2026-07-14T04:00:00.000Z",
        updatedAt: "2026-07-14T04:30:00.000Z",
      },
    ],
    studyCards: [
      {
        id: studyCardId,
        source: "bookmark",
        target: {
          lawId,
          revisionId,
          article: "1",
          path: "Article/1",
          fingerprint: "sha256:civil-code-article-1",
          pinned: true,
        },
        type: "article_number",
        question: "私権の基本原則を定めるのは民法何条か。",
        answer: "第一条",
        choices: ["第一条", "第二条", "第三条"],
        explanation: "民法第一条は私権の基本原則を定める。",
        tags: ["民法", "条文番号"],
        examPinned: true,
        createdAt: "2026-07-14T05:00:00.000Z",
        updatedAt: "2026-07-14T05:30:00.000Z",
      },
    ],
    reviewLogs: [
      {
        id: "review-log-civil-code-1",
        cardId: studyCardId,
        sessionId: studySessionId,
        grade: "good",
        reviewedAt: "2026-07-14T06:05:00.000Z",
        durationMs: 1200,
        scheduler: "fixed-interval@1",
      },
    ],
    studySessions: [
      {
        id: studySessionId,
        startedAt: "2026-07-14T06:00:00.000Z",
        finishedAt: "2026-07-14T06:10:00.000Z",
        cardIds: [studyCardId],
      },
    ],
  };
};

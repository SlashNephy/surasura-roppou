import { describe, expect, it } from "vitest";

import {
  type ArticleReference,
  buildArticleReferenceKey,
  buildLawArticleUrl,
  parseArticleReferenceKey,
} from "./references";
import type {
  Annotation,
  Bookmark,
  Collection,
  DetectedLawReference,
  Law,
  LawNode,
  LawReferenceCandidate,
  LawRevision,
  QuizResult,
  StudyCard,
  StudySession,
} from "./models";

describe("article reference keys", () => {
  it.each([
    [
      "article only",
      { lawId: "129AC0000000089", article: "709" },
      "law:129AC0000000089/article:709",
      "/laws/129AC0000000089/articles/709",
    ],
    [
      "specific revision and nested unit",
      {
        lawId: "129AC0000000089",
        revisionId: "20240401",
        article: "709",
        paragraph: "1",
        item: "2",
      },
      "law:129AC0000000089/revision:20240401/article:709/paragraph:1/item:2",
      "/laws/129AC0000000089/20240401/articles/709?paragraph=1&item=2",
    ],
  ] as const)("builds stable keys and URLs for %s", (_name, reference, key, url) => {
    expect(buildArticleReferenceKey(reference)).toBe(key);
    expect(buildLawArticleUrl(reference)).toBe(url);
    expect(parseArticleReferenceKey(key)).toEqual(reference);
  });

  it("rejects malformed storage keys", () => {
    expect(parseArticleReferenceKey("law:129AC0000000089/paragraph:1")).toBeUndefined();
    expect(parseArticleReferenceKey("129AC0000000089/article:709")).toBeUndefined();
  });

  it("rejects malformed percent-encoded keys without throwing", () => {
    expect(parseArticleReferenceKey("law:foo%2/article:709")).toBeUndefined();
    expect(parseArticleReferenceKey("law:foo%/article:709")).toBeUndefined();
  });

  it("omits null optional values from keys and URLs", () => {
    const reference = {
      lawId: "129AC0000000089",
      revisionId: null,
      article: "709",
      paragraph: null,
      item: null,
    } satisfies ArticleReference;

    expect(buildArticleReferenceKey(reference)).toBe("law:129AC0000000089/article:709");
    expect(buildLawArticleUrl(reference)).toBe("/laws/129AC0000000089/articles/709");
  });

  it("omits empty optional values from keys and URLs", () => {
    const reference = {
      lawId: "129AC0000000089",
      revisionId: "",
      article: "709",
      paragraph: "",
      item: "",
    } satisfies ArticleReference;

    expect(buildArticleReferenceKey(reference)).toBe("law:129AC0000000089/article:709");
    expect(buildLawArticleUrl(reference)).toBe("/laws/129AC0000000089/articles/709");
  });

  it.each([
    [
      "latest law top",
      { lawId: "129AC0000000089" },
      "law:129AC0000000089",
      "/laws/129AC0000000089",
    ],
    [
      "specific revision top",
      { lawId: "129AC0000000089", revisionId: "20240401" },
      "law:129AC0000000089/revision:20240401",
      "/laws/129AC0000000089/20240401",
    ],
  ] as const)("builds stable keys and URLs for %s", (_name, reference, key, url) => {
    expect(buildArticleReferenceKey(reference)).toBe(key);
    expect(buildLawArticleUrl(reference)).toBe(url);
    expect(parseArticleReferenceKey(key)).toEqual(reference);
  });

  it("round-trips Japanese text and reserved URL characters", () => {
    const reference = {
      lawId: "民法/明治",
      article: "709の2",
      paragraph: "1 号",
    } satisfies ArticleReference;

    expect(buildArticleReferenceKey(reference)).toBe(
      "law:%E6%B0%91%E6%B3%95%2F%E6%98%8E%E6%B2%BB/article:709%E3%81%AE2/paragraph:1%20%E5%8F%B7",
    );
    expect(buildLawArticleUrl(reference)).toBe(
      "/laws/%E6%B0%91%E6%B3%95%2F%E6%98%8E%E6%B2%BB/articles/709%E3%81%AE2?paragraph=1+%E5%8F%B7",
    );
    expect(parseArticleReferenceKey(buildArticleReferenceKey(reference))).toEqual(reference);
  });
});

describe("domain model contracts", () => {
  it("represents law text and user-owned study data with shared article references", () => {
    const law = {
      lawId: "129AC0000000089",
      title: "民法",
      lawNumber: "明治二十九年法律第八十九号",
      lawType: "Act",
      aliases: ["民法", "民"],
      source: "egov",
      updatedAt: "2026-07-05T00:00:00.000Z",
    } satisfies Law;

    const revision = {
      lawId: law.lawId,
      revisionId: "20240401",
      asOf: "2024-04-01",
      effectiveDate: "2024-04-01",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      sourceUrl: "https://elaws.e-gov.go.jp/document?lawid=129AC0000000089",
    } satisfies LawRevision;

    const articleNode = {
      id: "129AC0000000089:20240401:article:709",
      lawId: law.lawId,
      revisionId: revision.revisionId,
      type: "Article",
      path: "article:709",
      number: "709",
      title: "不法行為による損害賠償",
      rawText: "故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は...",
      normalizedText: "故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は...",
      children: [],
    } satisfies LawNode;

    const bookmark = {
      id: "bookmark-1",
      target: { lawId: law.lawId, revisionId: revision.revisionId, article: "709" },
      title: "民法709条",
      note: "不法行為の基本条文",
      tags: ["民法", "不法行為"],
      color: "blue",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    } satisfies Bookmark;

    const lawTopBookmark = {
      id: "bookmark-2",
      target: { lawId: law.lawId },
      title: "民法",
      tags: ["民法"],
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    } satisfies Bookmark;

    const collection = {
      id: "collection-1",
      title: "不法行為",
      description: "民法の不法行為領域",
      bookmarkIds: [bookmark.id],
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    } satisfies Collection;

    const annotation = {
      id: "annotation-1",
      target: bookmark.target,
      targetText: "他人の権利又は法律上保護される利益",
      prefixText: "故意又は過失によって",
      suffixText: "を侵害した者は",
      note: "保護法益の範囲を確認する",
      tags: ["論点"],
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    } satisfies Annotation;

    const candidate = {
      lawId: law.lawId,
      lawTitle: law.title,
      revisionId: revision.revisionId,
      article: "709",
      score: 0.98,
      reason: ["略称が一致", "条番号が一致"],
    } satisfies LawReferenceCandidate;

    const detectedReference = {
      id: "detected-1",
      rawText: "民709",
      normalizedText: "民法709条",
      lawNameCandidate: "民法",
      lawAlias: "民",
      article: "709",
      confidence: 0.94,
      source: { type: "manual" },
      candidates: [candidate],
    } satisfies DetectedLawReference;

    const studyCard = {
      id: "card-1",
      source: "bookmark",
      target: bookmark.target,
      type: "article_number",
      question: "不法行為の一般規定は何条か。",
      answer: "民法709条",
      explanation: "故意又は過失による権利侵害の損害賠償責任を定める。",
      tags: ["民法"],
      dueAt: "2026-07-06T00:00:00.000Z",
      intervalDays: 1,
      ease: 2.5,
      mistakes: 0,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    } satisfies StudyCard;

    const quizResult = {
      cardId: studyCard.id,
      answeredAt: "2026-07-05T00:00:00.000Z",
      rating: "good",
      elapsedMs: 4200,
      wasCorrect: true,
    } satisfies QuizResult;

    const studySession = {
      id: "session-1",
      startedAt: "2026-07-05T00:00:00.000Z",
      finishedAt: "2026-07-05T00:10:00.000Z",
      cardIds: [studyCard.id],
      results: [quizResult],
    } satisfies StudySession;

    expect(articleNode.path).toBe("article:709");
    expect(collection.bookmarkIds).toContain(bookmark.id);
    expect(lawTopBookmark.target).toEqual({ lawId: law.lawId });
    expect(annotation.target).toEqual(bookmark.target);
    expect(detectedReference.candidates[0]).toEqual(candidate);
    expect(studySession.results[0]).toEqual(quizResult);
  });
});

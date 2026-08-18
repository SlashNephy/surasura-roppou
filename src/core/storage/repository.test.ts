import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  Annotation,
  Bookmark,
  CardSchedule,
  Collection,
  Law,
  LawNode,
  LawRevision,
  OcrSession,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";
import { buildArticleReferenceKey } from "@/core/domain";
import { createSavedDataExport, parseSavedDataImport } from "@/core/storage";
import { createSavedDataExportFixture } from "@/test/fixtures/saved-data";

import {
  createStorageRepository as originalCreateStorageRepository,
  deleteSurasuraDatabase,
  openSurasuraDatabase,
  shouldRewriteRevisionNodes,
} from "./repository";
import type { SavedLawRecord, StorageRepository, StorageRepositoryOptions } from "./repository";

const fixedNow = () => new Date("2026-07-06T00:00:00.000Z");
const openedRepositories: StorageRepository[] = [];
const openedDatabaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(openedRepositories.splice(0).map((repository) => repository.close()));
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

describe("StorageRepository", () => {
  it("persists a law document as metadata, revision, saved marker, and ordered nodes", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 2,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        byteSize: expect.any(Number) as number,
      },
    ]);
  });

  it("preserves first saved time when a law document is refreshed", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });

    currentTime = new Date("2026-07-07T00:00:00.000Z");
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 2,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        byteSize: expect.any(Number) as number,
      },
    ]);
  });

  it("keeps the previous revision as history and demotes it when a saved law is refreshed with another revision", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });
    const nextRevision = {
      ...revision,
      revisionId: "129AC0000000089_20260701_0000000000000",
      effectiveDate: "2026-07-01",
    } satisfies LawRevision;
    const nextNode = {
      ...articleNode,
      id: "129AC0000000089:129AC0000000089_20260701_0000000000000:article:1",
      revisionId: nextRevision.revisionId,
    } satisfies LawNode;

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });
    await repository.saveLawDocument({ law, revision: nextRevision, nodes: [nextNode] });

    const database = await openSurasuraDatabase(databaseName);
    try {
      // 旧版のノードとレコードは履歴として残る。isCurrent だけ降格する。
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [law.lawId, revision.revisionId]),
      ).resolves.toHaveLength(1);
      await expect(database.get("lawRevisions", revision.revisionId)).resolves.toEqual(revision);
      await expect(database.get("savedLaws", [law.lawId, revision.revisionId])).resolves.toEqual(
        expect.objectContaining({ isCurrent: 0 }),
      );
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [
          law.lawId,
          nextRevision.revisionId,
        ]),
      ).resolves.toHaveLength(1);
      await expect(
        database.get("savedLaws", [law.lawId, nextRevision.revisionId]),
      ).resolves.toEqual(expect.objectContaining({ isCurrent: 1 }));
    } finally {
      database.close();
    }
  });

  it("demotes the previous current revision and keeps it as history", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    // 現行版は後から保存した版になる。
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });

    const database = await openSurasuraDatabase(databaseName);
    try {
      const records = await database.getAllFromIndex("savedLaws", "by-law-id", law.lawId);

      expect(
        records.map((record) => ({ revisionId: record.revisionId, isCurrent: record.isCurrent })),
      ).toEqual(
        expect.arrayContaining([
          { revisionId: olderRevision.revisionId, isCurrent: 0 },
          { revisionId: revision.revisionId, isCurrent: 1 },
        ]),
      );
      expect(records).toHaveLength(2);
    } finally {
      database.close();
    }
  });

  it("keeps updatedAt of the demoted revision unchanged when a newer revision is saved later", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: () => currentTime });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });

    currentTime = new Date("2026-07-07T00:00:00.000Z");
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    const database = await openSurasuraDatabase(databaseName);
    try {
      // 降格されたレコードの updatedAt は最初の保存時刻のまま据え置かれる。後続の LRU 実装が依存する性質。
      await expect(
        database.get("savedLaws", [law.lawId, olderRevision.revisionId]),
      ).resolves.toEqual(
        expect.objectContaining({
          isCurrent: 0,
          updatedAt: "2026-07-06T00:00:00.000Z",
        }),
      );
      await expect(database.get("savedLaws", [law.lawId, revision.revisionId])).resolves.toEqual(
        expect.objectContaining({
          isCurrent: 1,
          updatedAt: "2026-07-07T00:00:00.000Z",
        }),
      );
    } finally {
      database.close();
    }
  });

  it("keeps the nodes of both revisions after saving a newer one", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [
          law.lawId,
          olderRevision.revisionId,
        ]),
      ).resolves.toHaveLength(1);
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [law.lawId, revision.revisionId]),
      ).resolves.toHaveLength(2);
    } finally {
      database.close();
    }
  });

  it("lists only the current revision of each law", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 2,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        byteSize: expect.any(Number) as number,
      },
    ]);
  });

  it("removes every revision of a law when the law document is deleted", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    await repository.deleteLawDocument(law.lawId);

    await expect(repository.getLawDocument(law.lawId)).resolves.toBeUndefined();

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.getAll("savedLaws")).resolves.toEqual([]);
      await expect(database.getAll("lawNodes")).resolves.toEqual([]);
      await expect(database.getAll("lawRevisions")).resolves.toEqual([]);
      await expect(database.getAll("laws")).resolves.toEqual([]);
    } finally {
      database.close();
    }
  });

  it("lists saved laws from newest to oldest", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });
    const olderLaw = {
      ...law,
      lawId: "129AC0000000088",
      title: "旧法",
      aliases: ["旧法"],
    } satisfies Law;
    const olderRevision = {
      ...revision,
      lawId: olderLaw.lawId,
      revisionId: "129AC0000000088_20260401_0000000000000",
    } satisfies LawRevision;
    const olderNode = {
      ...articleNode,
      id: "129AC0000000088:129AC0000000088_20260401_0000000000000:article:1",
      lawId: olderLaw.lawId,
      revisionId: olderRevision.revisionId,
    } satisfies LawNode;

    await repository.saveLawDocument({
      law: olderLaw,
      revision: olderRevision,
      nodes: [olderNode],
    });

    currentTime = new Date("2026-07-07T00:00:00.000Z");
    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });

    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 1,
        savedAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        byteSize: expect.any(Number) as number,
      },
      {
        law: olderLaw,
        revision: olderRevision,
        nodeCount: 1,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        byteSize: expect.any(Number) as number,
      },
    ]);
  });

  it("reads a specific saved revision", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(
      repository.getLawDocumentRevision(law.lawId, olderRevision.revisionId),
    ).resolves.toEqual({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
    await expect(
      repository.getLawDocumentRevision(law.lawId, "129AC0000000089_19000101_missing"),
    ).resolves.toBeUndefined();
  });

  it("lists every saved revision of a law with the current flag", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    // savedAt は 2 版とも同値。索引の返却順に依存せず revisionId 降順で並ぶこと。
    await expect(repository.listSavedRevisions(law.lawId)).resolves.toEqual([
      {
        revision,
        isCurrent: true,
        nodeCount: 2,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
      },
      {
        revision: olderRevision,
        isCurrent: false,
        nodeCount: 1,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  it("deletes a single revision without touching the others", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    await repository.deleteLawRevision(law.lawId, olderRevision.revisionId);

    await expect(
      repository.getLawDocumentRevision(law.lawId, olderRevision.revisionId),
    ).resolves.toBeUndefined();
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("leaves the law without a current revision when the current revision is deleted while history remains", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    // 現行版 (revision) を削除する。deleteLawRevision は「現行版を最後に残す」規則を保証しない。
    // これは PR 3 のエビクションが守るべき既知の仕様として固定する。
    await repository.deleteLawRevision(law.lawId, revision.revisionId);

    // 現行版が無くなったため getLawDocument は何も返さない。
    await expect(repository.getLawDocument(law.lawId)).resolves.toBeUndefined();

    // 履歴版 (olderRevision) は引き続き引ける。
    await expect(
      repository.getLawDocumentRevision(law.lawId, olderRevision.revisionId),
    ).resolves.toEqual({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
    await expect(repository.listSavedRevisions(law.lawId)).resolves.toEqual([
      expect.objectContaining({ revision: olderRevision, isCurrent: false }),
    ]);

    // 版がまだ残っているため、法令メタ (laws ストア) は削除されない。
    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.get("laws", law.lawId)).resolves.toEqual(law);
    } finally {
      database.close();
    }
  });

  it("removes the pin when the last revision of a law is deleted revision by revision", async () => {
    // deleteLawDocument と違い、deleteLawRevision は版を 1 件ずつ消す。最後の 1 件が消えると
    // 法令メタも消えるため、ピンだけが残ると本文の無い幽霊ピンになる。PR 3 のエビクションは
    // この経路で版を消すので、いま契約として固定しておく。
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    await repository.saveLawDocument(
      { law, revision: olderRevision, nodes: [olderArticleNode] },
      { isCurrent: false },
    );
    await repository.pinLaw(law.lawId);

    await repository.deleteLawRevision(law.lawId, olderRevision.revisionId);

    // 版がまだ残っているうちはピンを外さない。
    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(true);

    await repository.deleteLawRevision(law.lawId, revision.revisionId);

    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(false);
    await expect(repository.listPinnedLaws()).resolves.toEqual([]);
  });

  it("saves a revision without promoting it to the current slot", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    await repository.saveLawDocument(
      { law, revision: olderRevision, nodes: [olderArticleNode] },
      { isCurrent: false },
    );

    // 現行版スロットは最初に保存した版のまま。
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
    await expect(
      repository.getLawDocumentRevision(law.lawId, olderRevision.revisionId),
    ).resolves.toEqual({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("does not demote a revision that is already current when saving it as non-current", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    await repository.saveLawDocument(
      { law, revision, nodes: [articleNode, paragraphNode] },
      { isCurrent: false },
    );

    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("promotes the first saved revision of a law to the current slot even when saved as non-current", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    // 基準日を指定して開いた場合、常に isCurrent: false で保存が呼ばれる。
    // その法令にまだ現行版が無いなら、この保存が空きスロットを埋めないと
    // オフライン時の getLawDocument によるフォールバックが永久に 1 件も引けなくなる。
    // 戻り値は「要求」ではなく「実際に現行版スロットへ入ったか」を表すため、
    // 呼び出し側（索引判断）はこの戻り値だけを見て良いことを永続化状態と対で固定する。
    await expect(
      repository.saveLawDocument(
        { law, revision, nodes: [articleNode, paragraphNode] },
        { isCurrent: false },
      ),
    ).resolves.toEqual({ isCurrent: true });

    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("does not steal the current slot from an existing current revision when saving another revision as non-current", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    // 戻り値も永続化状態と対で固定する。既存の現行版があるため isCurrent: false のまま返る。
    await expect(
      repository.saveLawDocument(
        { law, revision: olderRevision, nodes: [olderArticleNode] },
        { isCurrent: false },
      ),
    ).resolves.toEqual({ isCurrent: false });

    // 現行版スロットは既存の現行版のまま。空きスロットを埋める規則は既存の現行版を奪わない。
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("keeps user bookmark, collection, annotation, and study records queryable by their public contract", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putBookmark(bookmark);
    await repository.putCollection(collection);
    await repository.putAnnotation(annotation);
    await repository.putStudyCard(studyCard);
    await repository.putStudySession(studySession);

    await expect(repository.listBookmarks()).resolves.toEqual([bookmark]);
    await expect(repository.listBookmarks({ lawId: law.lawId })).resolves.toEqual([bookmark]);
    await expect(repository.listBookmarks({ lawId: "not-matching-law" })).resolves.toEqual([]);
    await expect(repository.listCollections()).resolves.toEqual([collection]);
    await expect(repository.listAnnotations({ lawId: law.lawId })).resolves.toEqual([annotation]);
    await expect(repository.listAnnotations({ lawId: "not-matching-law" })).resolves.toEqual([]);
    await expect(repository.listStudyCards()).resolves.toEqual([studyCard]);
    await expect(repository.listStudyCards({ lawId: law.lawId })).resolves.toEqual([studyCard]);
    await expect(repository.listStudyCards({ lawId: "not-matching-law" })).resolves.toEqual([]);
    // スケジュール（= 回答履歴）を持たない未学習カードは出題キューに現れない。
    await expect(repository.listDueStudyCards("2026-07-07T00:00:00.000Z")).resolves.toEqual([]);
    await expect(repository.listStudySessions()).resolves.toEqual([studySession]);
  });

  it("returns due cards joined with their schedules in dueAt order", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });
    const secondCard = {
      ...studyCard,
      id: "card-2",
    } satisfies StudyCard;
    const dueSchedule = {
      cardId: studyCard.id,
      dueAt: "2026-07-05T00:00:00.000Z",
      intervalDays: 1,
      lapses: 0,
      reviews: 1,
      recentMistakeRate: 0,
      derivedFrom: "log-1",
    } satisfies CardSchedule;
    const futureSchedule = {
      ...dueSchedule,
      cardId: secondCard.id,
      dueAt: "2026-07-08T00:00:00.000Z",
      derivedFrom: "log-2",
    } satisfies CardSchedule;

    await repository.putStudyCard(studyCard);
    await repository.putStudyCard(secondCard);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await database.put("cardSchedules", dueSchedule);
      await database.put("cardSchedules", futureSchedule);
    } finally {
      database.close();
    }

    await expect(repository.listDueStudyCards("2026-07-06T00:00:00.000Z")).resolves.toEqual([
      { card: studyCard, schedule: dueSchedule },
    ]);
    await expect(repository.listDueStudyCards("2026-07-08T00:00:00.000Z")).resolves.toEqual([
      { card: studyCard, schedule: dueSchedule },
      { card: secondCard, schedule: futureSchedule },
    ]);
  });

  it("lists unscheduled cards oldest-created first", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });
    // createdAt が新しい未学習カード。並び順検証のため既存フィクスチャより後の日時にする。
    const newerCard = {
      ...studyCard,
      id: "card-newer",
      createdAt: "2026-07-07T00:00:00.000Z",
    } satisfies StudyCard;
    // スケジュール済み(= 学習済み)のカード。結果に含まれないことを検証する。
    const scheduledCard = {
      ...studyCard,
      id: "card-scheduled",
    } satisfies StudyCard;
    const schedule = {
      cardId: scheduledCard.id,
      dueAt: "2026-07-07T00:00:00.000Z",
      intervalDays: 1,
      lapses: 0,
      reviews: 1,
      recentMistakeRate: 0,
      derivedFrom: "log-1",
    } satisfies CardSchedule;

    await repository.putStudyCard(newerCard);
    await repository.putStudyCard(studyCard);
    await repository.putStudyCard(scheduledCard);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await database.put("cardSchedules", schedule);
    } finally {
      database.close();
    }

    await expect(repository.listUnscheduledStudyCards()).resolves.toEqual([studyCard, newerCard]);
  });

  it("records OCR sessions without requiring image blob persistence", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putOcrSession(ocrSession);

    await expect(repository.listOcrSessions()).resolves.toEqual([ocrSession]);
  });

  it("deletes a saved law and its structural nodes without deleting user-owned notes", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });
    await repository.putBookmark(bookmark);

    await repository.deleteLawDocument(law.lawId);

    await expect(repository.getLawDocument(law.lawId)).resolves.toBeUndefined();
    await expect(repository.listBookmarks({ lawId: law.lawId })).resolves.toEqual([bookmark]);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [law.lawId, revision.revisionId]),
      ).resolves.toEqual([]);
      await expect(database.get("laws", law.lawId)).resolves.toBeUndefined();
      await expect(database.get("lawRevisions", revision.revisionId)).resolves.toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("returns a stored study card by id and undefined for unknown ids", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putStudyCard(studyCard);

    await expect(repository.getStudyCard(studyCard.id)).resolves.toEqual(studyCard);
    await expect(repository.getStudyCard("missing-card")).resolves.toBeUndefined();
  });

  it("records a review by appending the log and deriving the schedule", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putStudyCard(studyCard);

    const schedule = await repository.recordReview({
      id: "log-1",
      cardId: studyCard.id,
      grade: "good",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      scheduler: "fixed-interval@1",
    });

    // 初回 good は学習 step 1 に進み 10 分後が期限になる（fixed-interval@1）。
    expect(schedule.dueAt).toBe("2026-07-06T00:10:00.000Z");
    expect(schedule.reviews).toBe(1);
    expect(schedule.derivedFrom).toBe("log-1");
    await expect(repository.listReviewLogs(studyCard.id)).resolves.toEqual([
      expect.objectContaining({ id: "log-1" }),
    ]);
    await expect(repository.listDueStudyCards("2026-07-07T00:00:00.000Z")).resolves.toEqual([
      { card: studyCard, schedule },
    ]);
  });

  it("lists all review logs across cards when no cardId is given", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });
    const secondCard = { ...studyCard, id: "card-2" } satisfies StudyCard;

    await repository.putStudyCard(studyCard);
    await repository.putStudyCard(secondCard);
    await repository.recordReview({
      id: "log-1",
      cardId: studyCard.id,
      grade: "good",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      scheduler: "fixed-interval@1",
    });
    await repository.recordReview({
      id: "log-2",
      cardId: secondCard.id,
      grade: "easy",
      reviewedAt: "2026-07-06T01:00:00.000Z",
      scheduler: "fixed-interval@1",
    });

    const logs = await repository.listReviewLogs();

    expect(logs.map((log) => log.id).sort()).toEqual(["log-1", "log-2"]);
  });

  it("replays the full history when recording additional reviews", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putStudyCard(studyCard);
    await repository.recordReview({
      id: "log-1",
      cardId: studyCard.id,
      grade: "good",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      scheduler: "fixed-interval@1",
    });

    const schedule = await repository.recordReview({
      id: "log-2",
      cardId: studyCard.id,
      grade: "good",
      reviewedAt: "2026-07-06T00:10:00.000Z",
      scheduler: "fixed-interval@1",
    });

    // good good で卒業して 1 日後。
    expect(schedule.dueAt).toBe("2026-07-07T00:10:00.000Z");
    expect(schedule.reviews).toBe(2);
    expect(schedule.derivedFrom).toBe("log-2");
  });

  it("deletes a study card together with its review logs and schedule", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });

    await repository.putStudyCard(studyCard);
    await repository.recordReview({
      id: "log-1",
      cardId: studyCard.id,
      grade: "good",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      scheduler: "fixed-interval@1",
    });

    await repository.deleteStudyCard(studyCard.id);

    await expect(repository.getStudyCard(studyCard.id)).resolves.toBeUndefined();
    await expect(repository.listReviewLogs(studyCard.id)).resolves.toEqual([]);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.get("cardSchedules", studyCard.id)).resolves.toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("imports all saved data categories and rebuilds card schedules", async () => {
    const fixture = createSavedDataExportFixture();
    fixture.reviewLogs[0] = { ...fixture.reviewLogs[0], id: "review-import-1" };
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await expect(repository.importSavedData(fixture)).resolves.toEqual({
      importedAt: fixedNow().toISOString(),
      counts: {
        savedLaws: 1,
        bookmarks: 1,
        collections: 1,
        annotations: 1,
        studyCards: 1,
        reviewLogs: 1,
        studySessions: 1,
      },
    });

    await expect(repository.getLawDocument(fixture.savedLaws[0].law.lawId)).resolves.toEqual(
      fixture.savedLaws[0],
    );
    await expect(repository.listBookmarks()).resolves.toEqual(fixture.bookmarks);
    await expect(repository.listCollections()).resolves.toEqual(fixture.collections);
    await expect(repository.listAnnotations()).resolves.toEqual(fixture.annotations);
    await expect(repository.listStudyCards()).resolves.toEqual(fixture.studyCards);
    await expect(repository.listReviewLogs()).resolves.toEqual(fixture.reviewLogs);
    await expect(repository.listStudySessions()).resolves.toEqual(fixture.studySessions);
    const dueCards = await repository.listDueStudyCards("2026-07-15T00:00:00.000Z");
    expect(dueCards).toHaveLength(1);
    expect(dueCards[0].card).toEqual(fixture.studyCards[0]);
    expect(dueCards[0].schedule).toMatchObject({
      cardId: fixture.studyCards[0].id,
      derivedFrom: "review-import-1",
      reviews: 1,
    });
  });

  it("demotes the previous revision instead of deleting it when importing a newer revision of the same law", async () => {
    const fixture = createSavedDataExportFixture();
    const incoming = createSavedDataExportFixture();
    const previousDocument = fixture.savedLaws[0];
    const previousNode = previousDocument.nodes[0];
    const nextRevision = {
      ...previousDocument.revision,
      revisionId: "129AC0000000089_20260715_0000000000000",
      effectiveDate: "2026-07-15",
      fetchedAt: "2026-07-15T01:00:00.000Z",
    } satisfies LawRevision;
    const nextNode = {
      ...previousNode,
      id: "civil-code-article-1-revised",
      revisionId: nextRevision.revisionId,
      rawText: "第一条　私権は、公共の福祉に適合しなければならない。改正後",
      plainText: "第一条 私権は、公共の福祉に適合しなければならない。改正後",
      normalizedText: "第一条 私権は 公共の福祉に適合しなければならない 改正後",
    } satisfies LawNode;
    const nextDocument = {
      ...previousDocument,
      revision: nextRevision,
      nodes: [nextNode],
    } satisfies typeof previousDocument;
    incoming.savedLaws = [nextDocument];
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.importSavedData(fixture);
    await repository.importSavedData(incoming);

    await expect(repository.getLawDocument(previousDocument.law.lawId)).resolves.toEqual(
      nextDocument,
    );

    const database = await openSurasuraDatabase(databaseName);
    try {
      // saveLawDocument と対称に、旧版のレコードとノードは削除せず、履歴として残る（isCurrent だけ降格する）。
      await expect(
        database.get("lawRevisions", previousDocument.revision.revisionId),
      ).resolves.toEqual(previousDocument.revision);
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [
          previousDocument.law.lawId,
          previousDocument.revision.revisionId,
        ]),
      ).resolves.toEqual([
        {
          id: previousNode.id,
          lawId: previousNode.lawId,
          revisionId: previousNode.revisionId,
          sortOrder: 0,
          node: previousNode,
        },
      ]);
      await expect(
        database.get("savedLaws", [
          previousDocument.law.lawId,
          previousDocument.revision.revisionId,
        ]),
      ).resolves.toEqual(expect.objectContaining({ isCurrent: 0 }));
      await expect(database.get("lawRevisions", nextRevision.revisionId)).resolves.toEqual(
        nextRevision,
      );
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [
          previousDocument.law.lawId,
          nextRevision.revisionId,
        ]),
      ).resolves.toEqual([
        {
          id: nextNode.id,
          lawId: nextNode.lawId,
          revisionId: nextNode.revisionId,
          sortOrder: 0,
          node: nextNode,
        },
      ]);
    } finally {
      database.close();
    }
  });

  it("replays existing and imported review logs when rebuilding a card schedule", async () => {
    const fixture = createSavedDataExportFixture();
    fixture.reviewLogs[0] = { ...fixture.reviewLogs[0], id: "review-import-1" };
    const existingReview = {
      ...fixture.reviewLogs[0],
      id: "review-existing-1",
      reviewedAt: "2026-07-14T06:00:00.000Z",
    } satisfies ReviewLog;
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.putStudyCard(fixture.studyCards[0]);
    await repository.recordReview(existingReview);
    await repository.importSavedData(fixture);

    const mergedLogs = await repository.listReviewLogs(fixture.studyCards[0].id);
    expect(mergedLogs.map((log) => log.id).sort()).toEqual([
      "review-existing-1",
      "review-import-1",
    ]);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.get("cardSchedules", fixture.studyCards[0].id)).resolves.toMatchObject({
        cardId: fixture.studyCards[0].id,
        reviews: 2,
        derivedFrom: "review-import-1",
        intervalDays: 1,
        dueAt: "2026-07-15T06:05:00.000Z",
      });
    } finally {
      database.close();
    }
  });

  it("removes a stale schedule when an imported card has no merged review history", async () => {
    const fixture = createSavedDataExportFixture();
    const staleReview = {
      ...fixture.reviewLogs[0],
      id: "stale-review-1",
    } satisfies ReviewLog;
    fixture.reviewLogs = [];
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.putStudyCard(fixture.studyCards[0]);
    await repository.recordReview(staleReview);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.get("cardSchedules", fixture.studyCards[0].id)).resolves.toMatchObject({
        derivedFrom: staleReview.id,
      });

      await database.delete("reviewLogs", staleReview.id);
      await expect(repository.listReviewLogs(fixture.studyCards[0].id)).resolves.toEqual([]);
      await expect(database.get("cardSchedules", fixture.studyCards[0].id)).resolves.toBeDefined();

      await repository.importSavedData(fixture);

      await expect(
        database.get("cardSchedules", fixture.studyCards[0].id),
      ).resolves.toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("merges imported records by id while preserving records absent from the import", async () => {
    const fixture = createSavedDataExportFixture();
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });
    const existingBookmark = { ...fixture.bookmarks[0], title: "既存タイトル" } satisfies Bookmark;
    const unrelatedCollection = {
      ...fixture.collections[0],
      id: "unrelated-collection",
      title: "import 対象外のコレクション",
      bookmarkIds: [],
    } satisfies Collection;

    await repository.putBookmark(existingBookmark);
    await repository.putCollection(unrelatedCollection);
    await repository.importSavedData(fixture);

    await expect(repository.listBookmarks()).resolves.toEqual(fixture.bookmarks);
    await expect(repository.listCollections()).resolves.toEqual([
      fixture.collections[0],
      unrelatedCollection,
    ]);
  });

  it("moves an overwritten review log to its imported card and rebuilds both schedules", async () => {
    const fixture = createSavedDataExportFixture();
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });
    const oldCard = { ...fixture.studyCards[0], id: "old-card" } satisfies StudyCard;

    await repository.putStudyCard(oldCard);
    await repository.recordReview({ ...fixture.reviewLogs[0], cardId: oldCard.id });

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.get("cardSchedules", oldCard.id)).resolves.toBeDefined();

      await repository.importSavedData(fixture);

      await expect(repository.listReviewLogs(oldCard.id)).resolves.toEqual([]);
      await expect(repository.listReviewLogs(fixture.studyCards[0].id)).resolves.toEqual(
        fixture.reviewLogs,
      );
      await expect(database.get("cardSchedules", oldCard.id)).resolves.toBeUndefined();
      await expect(database.get("cardSchedules", fixture.studyCards[0].id)).resolves.toMatchObject({
        cardId: fixture.studyCards[0].id,
        derivedFrom: fixture.reviewLogs[0].id,
        reviews: 1,
      });
    } finally {
      database.close();
    }
  });

  it("rolls back every imported record when a later IndexedDB write fails", async () => {
    const fixture = createSavedDataExportFixture();
    Object.assign(fixture.reviewLogs[0], { id: undefined });
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await expect(repository.importSavedData(fixture)).rejects.toMatchObject({ name: "DataError" });

    await expect(
      repository.getLawDocument(fixture.savedLaws[0].law.lawId),
    ).resolves.toBeUndefined();
    await expect(repository.listBookmarks()).resolves.toEqual([]);
    await expect(repository.listStudyCards()).resolves.toEqual([]);
  });

  it("round-trips a current version 2 export through JSON parsing and a fresh repository", async () => {
    const fixture = createSavedDataExportFixture();
    const source = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });
    const target = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await source.importSavedData(fixture);
    const sourceExport = await createSavedDataExport(source, fixture.exportedAt);
    const parsed = parseSavedDataImport(JSON.stringify(sourceExport)).data;

    await target.importSavedData(parsed);
    const targetExport = await createSavedDataExport(target, sourceExport.exportedAt);

    expect(targetExport).toEqual(sourceExport);
  });

  it("exports only the current revision of each saved law", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    const exported = await createSavedDataExport(repository, fixedNow().toISOString());

    expect(exported.savedLaws).toHaveLength(1);
    expect(exported.savedLaws[0]?.revision).toEqual(revision);
  });

  it("imports a saved law into the current slot without breaking existing history revisions", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    // 先に旧版を保存して現行版にし、続けて新版を保存して旧版を履歴へ降格させる。
    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    const sourceExport = createSavedDataExportFixture();
    const parsed = parseSavedDataImport(JSON.stringify(sourceExport)).data;

    await repository.importSavedData(parsed);

    const savedLaws = await repository.listSavedLaws();

    expect(savedLaws).toHaveLength(1);
    expect(savedLaws[0]?.law.lawId).toBe(parsed.savedLaws[0]?.law.lawId);
    expect(savedLaws[0]?.revision).toEqual(parsed.savedLaws[0]?.revision);

    // 既存の履歴版 (olderRevision) がインポートによって失われていないことを検証する。
    const revisions = await repository.listSavedRevisions(law.lawId);
    expect(revisions).toContainEqual(
      expect.objectContaining({
        revision: olderRevision,
        isCurrent: false,
      }),
    );
  });

  it("demotes the previous current revision instead of deleting it when importing a different revision", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    // 版 A (olderRevision) だけを保存して現行版にする。
    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });

    // フィクスチャは同じ法令の版 B (revision) を含む。
    const sourceExport = createSavedDataExportFixture();
    const parsed = parseSavedDataImport(JSON.stringify(sourceExport)).data;
    const importedSavedLaw = parsed.savedLaws[0];

    await repository.importSavedData(parsed);

    // インポートした版 B が現行版になる。
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law: importedSavedLaw.law,
      revision: importedSavedLaw.revision,
      nodes: importedSavedLaw.nodes,
      savedAt: importedSavedLaw.savedAt,
    });

    // 版 A は saveLawDocument と対称に、レコードを残したまま履歴へ降格する（削除しない）。
    const revisions = await repository.listSavedRevisions(law.lawId);
    expect(revisions).toContainEqual(
      expect.objectContaining({
        revision: olderRevision,
        isCurrent: false,
      }),
    );

    // ノードも消えていないため、版 A の本文をそのまま引ける。
    // laws ストアは lawId 単位のため、law 自体はインポートで上書きされたものになる。
    await expect(
      repository.getLawDocumentRevision(law.lawId, olderRevision.revisionId),
    ).resolves.toEqual({
      law: importedSavedLaw.law,
      revision: olderRevision,
      nodes: [olderArticleNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("does not leave ghost nodes when importing a saved law whose revision is a demoted history entry", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });

    // 版 A (olderRevision) を保存して現行版にし、続けて版 B (revision) を保存して A を履歴へ降格させる。
    await repository.saveLawDocument({
      law,
      revision: olderRevision,
      nodes: [olderArticleNode],
    });
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    // 版 A を含むエクスポートをインポートする。インポート側のノードは既存の olderArticleNode とは別物。
    const importedNode = {
      ...olderArticleNode,
      id: "civil-code-article-1-imported",
      rawText: "第一条　私権は、公共の福祉に適合しなければならない。インポート版",
      plainText: "第一条 私権は、公共の福祉に適合しなければならない。インポート版",
      normalizedText: "第一条 私権は 公共の福祉に適合しなければならない インポート版",
    } satisfies LawNode;
    const sourceExport = createSavedDataExportFixture();
    sourceExport.savedLaws = [
      {
        law,
        revision: olderRevision,
        nodes: [importedNode],
        savedAt: "2026-07-14T01:00:00.000Z",
      },
    ];
    const parsed = parseSavedDataImport(JSON.stringify(sourceExport)).data;

    await repository.importSavedData(parsed);

    const importedDocument = await repository.getLawDocumentRevision(
      law.lawId,
      olderRevision.revisionId,
    );

    // インポート後の版 A の本文は、インポートされたノードだけであるべき（旧 olderArticleNode が幽霊ノードとして残ってはいけない）。
    expect(importedDocument?.nodes).toEqual([importedNode]);

    const database = await openSurasuraDatabase(databaseName);
    try {
      const savedLawRecord = await database.get("savedLaws", [law.lawId, olderRevision.revisionId]);
      const actualNodes = await database.getAllFromIndex("lawNodes", "by-law-revision", [
        law.lawId,
        olderRevision.revisionId,
      ]);

      // nodeCount と実際に保存されているノード件数が一致することを検証する。
      expect(savedLawRecord?.nodeCount).toBe(actualNodes.length);
      expect(actualNodes).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("pins and unpins a law without touching its saved documents", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(false);

    await repository.pinLaw(law.lawId);

    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(true);
    await expect(repository.listPinnedLaws()).resolves.toEqual([
      { lawId: law.lawId, pinnedAt: "2026-07-06T00:00:00.000Z" },
    ]);

    await repository.unpinLaw(law.lawId);

    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(false);
    await expect(repository.listPinnedLaws()).resolves.toEqual([]);

    // ピン留めの解除は本文を消さない。
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("removes the pin when the pinned law's document is deleted", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    await repository.pinLaw(law.lawId);

    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(true);

    await repository.deleteLawDocument(law.lawId);

    // 本文が消えたあとにピンだけが幽霊レコードとして残ってはいけない。
    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(false);
    await expect(repository.listPinnedLaws()).resolves.toEqual([]);
  });

  it("removes a pin that has no saved document", async () => {
    // 自動保存が失敗したままピン留めだけが成立する不整合（保存領域が満杯など）を想定する。
    // savedLaws に該当法令の行が 1 件も無い（records.length === 0）ため、実装は早期 return する
    // 前にピンを消しておく必要がある。この分岐は本文を事前に保存する既存テストでは検証できない。
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.pinLaw(law.lawId);
    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(true);

    await repository.deleteLawDocument(law.lawId);

    await expect(repository.isLawPinned(law.lawId)).resolves.toBe(false);
    await expect(repository.listPinnedLaws()).resolves.toEqual([]);
  });

  it("keeps the first pinned time when the same law is pinned again", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });

    await repository.pinLaw(law.lawId);
    currentTime = new Date("2026-07-09T00:00:00.000Z");
    await repository.pinLaw(law.lawId);

    await expect(repository.listPinnedLaws()).resolves.toEqual([
      { lawId: law.lawId, pinnedAt: "2026-07-06T00:00:00.000Z" },
    ]);
  });

  it("orders pinned laws deterministically when they share the same pinned time", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    // 同一ミリ秒でのピン留めは pinnedAt が同値になる。索引の返却順に任せず lawId 降順で決める。
    await repository.pinLaw("129AC0000000089");
    await repository.pinLaw("132AC0000000048");
    await repository.pinLaw("140AC0000000045");

    await expect(repository.listPinnedLaws()).resolves.toEqual([
      { lawId: "140AC0000000045", pinnedAt: "2026-07-06T00:00:00.000Z" },
      { lawId: "132AC0000000048", pinnedAt: "2026-07-06T00:00:00.000Z" },
      { lawId: "129AC0000000089", pinnedAt: "2026-07-06T00:00:00.000Z" },
    ]);
  });

  it("注釈を保存して削除できる", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    const target = { lawId: "322AC0000000125", article: "1", path: "Article:1" };

    await repository.putAnnotation({
      id: "h1",
      target,
      anchors: [{ target, quote: "私権", prefix: "", suffix: "は、" }],
      color: "yellow",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    });

    await expect(repository.listAnnotations({ lawId: target.lawId })).resolves.toHaveLength(1);

    await repository.deleteAnnotation("h1");

    await expect(repository.listAnnotations({ lawId: target.lawId })).resolves.toEqual([]);
  });

  it("存在しない注釈の削除はエラーにしない", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await expect(repository.deleteAnnotation("missing")).resolves.toBeUndefined();
  });

  it("旧形式(v2)の注釈レコードを anchors 付きの現行形式へ正規化して読み出す", async () => {
    // v2 エクスポート由来のレコードは anchors を持たず、targetText/prefixText/suffixText で
    // ハイライト範囲を表していた。IndexedDB に残った当時のレコードを模して直接書き込む。
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });
    const legacyTarget = { lawId: law.lawId, article: "1" };
    const legacyRecord = {
      id: "legacy-annotation-1",
      target: legacyTarget,
      targetText: "私権",
      prefixText: "",
      suffixText: "は、",
      tags: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      lawId: legacyTarget.lawId,
      targetKey: buildArticleReferenceKey(legacyTarget),
    };

    const database = await openSurasuraDatabase(databaseName);
    try {
      await database.put(
        "annotations",
        legacyRecord as unknown as Annotation & { lawId: string; targetKey: string },
      );
    } finally {
      database.close();
    }

    await expect(repository.listAnnotations({ lawId: law.lawId })).resolves.toEqual([
      {
        id: "legacy-annotation-1",
        target: legacyTarget,
        anchors: [{ target: legacyTarget, quote: "私権", prefix: "", suffix: "は、" }],
        tags: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });

  it("正規化できない壊れた注釈レコードは黙って除外し、他の注釈は読み出せる", async () => {
    // target を欠く等、新しい契約を満たせないレコード(想定外の破損)を模す。
    // 1件の破損で法令全体のハイライトが読めなくなるのを避けるため、例外にせず除外する。
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.putAnnotation(annotation);

    const brokenRecord = {
      id: "broken-annotation-1",
      tags: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      lawId: law.lawId,
      targetKey: "broken",
    };

    const database = await openSurasuraDatabase(databaseName);
    try {
      await database.put(
        "annotations",
        brokenRecord as unknown as Annotation & { lawId: string; targetKey: string },
      );
    } finally {
      database.close();
    }

    await expect(repository.listAnnotations({ lawId: law.lawId })).resolves.toEqual([annotation]);
  });

  it("closes the cached connection and can reopen on later operations", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putCollection(collection);
    await repository.close();

    await repository.putCollection({ ...collection, id: "collection-2", title: "再オープン" });

    await expect(repository.listCollections()).resolves.toEqual([
      collection,
      { ...collection, id: "collection-2", title: "再オープン" },
    ]);
  });

  it("sums the stored size across every revision of a law", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    const [currentOnly] = await repository.listSavedLaws();
    const currentOnlySize = currentOnly.byteSize ?? 0;

    expect(currentOnlySize).toBeGreaterThan(0);

    await repository.saveLawDocument(
      { law, revision: olderRevision, nodes: [olderArticleNode] },
      { isCurrent: false },
    );

    const [withHistory] = await repository.listSavedLaws();

    // 一覧は現行版だけを返すが、容量は履歴版も含めた実際の占有量でなければ
    // 「消したのに減らない」という見え方になる。
    expect(withHistory.byteSize ?? 0).toBeGreaterThan(currentOnlySize);
  });

  it("lists saved law records oldest first for eviction", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });
    currentTime = new Date("2026-07-09T00:00:00.000Z");
    await repository.saveLawDocument(
      { law, revision: olderRevision, nodes: [olderArticleNode] },
      { isCurrent: false },
    );

    const records = await repository.listSavedLawRecords();

    // 先に消す候補が先頭に来る。
    expect(records.map((record) => record.revisionId)).toEqual([
      revision.revisionId,
      olderRevision.revisionId,
    ]);
  });

  it("breaks ties on updatedAt by lawId, not revisionId, matching the savedLaws composite primary key", async () => {
    // 索引 by-updated-at のキーが同値のとき、IndexedDB は主キー([lawId, revisionId]) 順で
    // レコードを返す。lawId の大小と revisionId の大小をわざと逆にして、どちらが効いているか
    // 判別できるようにする。
    const lawZ = { ...law, lawId: "zLaw", aliases: [] } satisfies Law;
    const revisionForZ = {
      ...revision,
      lawId: lawZ.lawId,
      revisionId: "1-revision",
    } satisfies LawRevision;
    const nodeForZ = {
      ...articleNode,
      id: "z-node",
      lawId: lawZ.lawId,
      revisionId: revisionForZ.revisionId,
    };

    const lawA = { ...law, lawId: "aLaw", aliases: [] } satisfies Law;
    const revisionForA = {
      ...revision,
      lawId: lawA.lawId,
      revisionId: "2-revision",
    } satisfies LawRevision;
    const nodeForA = {
      ...articleNode,
      id: "a-node",
      lawId: lawA.lawId,
      revisionId: revisionForA.revisionId,
    };

    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    // 同一時刻で保存し、updatedAt を同値にする。
    await repository.saveLawDocument({ law: lawZ, revision: revisionForZ, nodes: [nodeForZ] });
    await repository.saveLawDocument({ law: lawA, revision: revisionForA, nodes: [nodeForA] });

    const records = await repository.listSavedLawRecords();

    expect(records.map((record) => record.lawId)).toEqual([lawA.lawId, lawZ.lawId]);
  });

  it("backfills the stored size of a record saved before sizes were recorded", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });
    await repository.setSavedLawByteSize(law.lawId, revision.revisionId, 12_345);

    const records = await repository.listSavedLawRecords();

    expect(records[0]?.byteSize).toBe(12_345);
    // 書き戻しは容量だけを触り、保存時刻を動かさない（LRU の順序が変わるため）。
    expect(records[0]?.updatedAt).toBe("2026-07-06T00:00:00.000Z");
  });

  it("keeps the document intact when the same revision is saved again", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });
    currentTime = new Date("2026-07-09T00:00:00.000Z");
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    // ノードの書き直しを省いても本文は欠けない。
    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });

    // LRU が使う updatedAt は書き直しの有無に関わらず進む。
    const [record] = await repository.listSavedLawRecords();

    expect(record.updatedAt).toBe("2026-07-09T00:00:00.000Z");
  });
});

describe("shouldRewriteRevisionNodes", () => {
  const stored = {
    lawId: "129AC0000000089",
    revisionId: "129AC0000000089_rev",
    isCurrent: 1 as const,
    nodeCount: 2,
    savedAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
    byteSize: 1_000,
  };

  it("rewrites when the revision has never been saved", () => {
    expect(shouldRewriteRevisionNodes(undefined, 1_000, 2)).toBe(true);
  });

  it("rewrites when the stored record predates size tracking", () => {
    // byteSize を持たないレコードは中身を照合できないので、安全側に倒して書き直す。
    const withoutSize: SavedLawRecord = {
      lawId: stored.lawId,
      revisionId: stored.revisionId,
      isCurrent: stored.isCurrent,
      nodeCount: stored.nodeCount,
      savedAt: stored.savedAt,
      updatedAt: stored.updatedAt,
    };

    expect(shouldRewriteRevisionNodes(withoutSize, 1_000, 2)).toBe(true);
  });

  it("rewrites when the normalized text changed even though the revision id did not", () => {
    // e-Gov の版が同じでも、こちらの正規化が変われば本文は変わる。
    // revisionId だけで判断すると、アプリ更新後に古い正規化結果が残り続ける。
    expect(shouldRewriteRevisionNodes(stored, 1_200, 2)).toBe(true);
    expect(shouldRewriteRevisionNodes(stored, 1_000, 3)).toBe(true);
  });

  it("skips the rewrite when the stored content matches", () => {
    expect(shouldRewriteRevisionNodes(stored, 1_000, 2)).toBe(false);
  });
});

const createStorageRepository = (options: StorageRepositoryOptions): StorageRepository => {
  const repository = originalCreateStorageRepository(options);
  openedRepositories.push(repository);
  return repository;
};

const createDatabaseName = (): string => {
  const name = `surasura-roppou-test-${crypto.randomUUID()}`;
  openedDatabaseNames.push(name);
  return name;
};

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  lawType: "Act",
  aliases: ["民法", "民"],
  source: "egov",
  updatedAt: "2026-06-24T10:54:14+09:00",
} satisfies Law;

const revision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  effectiveDate: "2026-06-24",
  fetchedAt: "2026-07-06T00:00:00.000Z",
  sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089",
} satisfies LawRevision;

const articleNode = {
  id: "129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  normalizedText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: ["129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1/paragraph:1"],
} satisfies LawNode;

const paragraphNode = {
  id: "129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1/paragraph:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Paragraph",
  path: "article:1/paragraph:1",
  number: "1",
  rawText: "私権は、公共の福祉に適合しなければならない。",
  plainText: "私権は、公共の福祉に適合しなければならない。",
  normalizedText: "私権は、公共の福祉に適合しなければならない。",
  children: [],
  parentId: articleNode.id,
} satisfies LawNode;

const olderRevision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20200401_502AC0000000033",
  effectiveDate: "2020-04-01",
  fetchedAt: "2026-07-06T00:00:00.000Z",
  sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089",
} satisfies LawRevision;

const olderArticleNode = {
  id: "129AC0000000089:129AC0000000089_20200401_502AC0000000033:article:1",
  lawId: law.lawId,
  revisionId: olderRevision.revisionId,
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  normalizedText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: [],
} satisfies LawNode;

const bookmark = {
  id: "bookmark-1",
  target: { lawId: law.lawId, revisionId: revision.revisionId, article: "1" },
  title: "民法1条",
  note: "基本原則",
  tags: ["民法"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Bookmark;

const collection = {
  id: "collection-1",
  title: "総則",
  bookmarkIds: [bookmark.id],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Collection;

const annotation = {
  id: "annotation-1",
  target: bookmark.target,
  anchors: [{ target: bookmark.target, quote: "公共の福祉", prefix: "", suffix: "" }],
  note: "基本原則として確認する",
  tags: ["論点"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Annotation;

const studyCard = {
  id: "card-1",
  source: "bookmark",
  target: bookmark.target,
  type: "article_number",
  question: "私権の公共の福祉適合性は何条か。",
  answer: "民法1条",
  tags: ["民法"],
  examPinned: false,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies StudyCard;

const studySession = {
  id: "study-session-1",
  startedAt: "2026-07-06T00:00:00.000Z",
  finishedAt: "2026-07-06T00:05:00.000Z",
  cardIds: [studyCard.id],
} satisfies StudySession;

const ocrSession = {
  id: "ocr-session-1",
  sourceText: "民法第一条",
  detectedReferences: [
    {
      id: "detected-1",
      rawText: "民法第一条",
      normalizedText: "民法1条",
      lawAlias: "民法",
      article: "1",
      confidence: 0.92,
      source: { type: "ocr" },
      candidates: [
        {
          lawId: law.lawId,
          lawTitle: law.title,
          revisionId: revision.revisionId,
          article: "1",
          score: 0.95,
          reason: ["法令名が一致", "条番号が一致"],
        },
      ],
    },
  ],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies OcrSession;

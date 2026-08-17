import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { createStorageRepository, deleteSurasuraDatabase } from "./repository";
import type { LawDocumentInput } from "./repository";
import { createSavedLawUseCase } from "./saved-law-use-case";

const openedDatabaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

describe("createSavedLawUseCase", () => {
  it("saves, lists, loads, and removes offline law documents through the storage contract", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => new Date("2026-07-06T00:00:00.000Z"),
    });
    const useCase = createSavedLawUseCase(repository);

    await useCase.save({ law, revision, nodes: [articleNode] });

    await expect(useCase.list()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 1,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
    await expect(useCase.get(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });

    await useCase.remove(law.lawId);

    await expect(useCase.get(law.lawId)).resolves.toBeUndefined();
    await repository.close();
  });

  it("propagates storage failures to callers", async () => {
    const error = new Error("Storage failed");
    const repository = {
      ...createMemoryStorageRepository().repository,
      saveLawDocument: () => Promise.reject(error),
    };
    const useCase = createSavedLawUseCase(repository);

    await expect(useCase.save({ law, revision, nodes: [articleNode] })).rejects.toBe(error);
  });

  it("save で保存後に indexer.indexLaw を呼ぶ", async () => {
    const indexLaw = vi.fn<(document: LawDocumentInput) => Promise<void>>(() => Promise.resolve());
    const removeLaw = vi.fn<(lawId: string) => Promise<void>>(() => Promise.resolve());
    const { repository } = createMemoryStorageRepository();
    const useCase = createSavedLawUseCase(repository, { indexer: { indexLaw, removeLaw } });
    const document: LawDocumentInput = { law, revision, nodes };

    await useCase.save(document);

    expect(indexLaw).toHaveBeenCalledWith(document);
  });

  it("remove で削除後に indexer.removeLaw を呼ぶ", async () => {
    const indexLaw = vi.fn<(document: LawDocumentInput) => Promise<void>>(() => Promise.resolve());
    const removeLaw = vi.fn<(lawId: string) => Promise<void>>(() => Promise.resolve());
    const { repository } = createMemoryStorageRepository();
    const useCase = createSavedLawUseCase(repository, { indexer: { indexLaw, removeLaw } });

    await useCase.remove("L1");

    expect(removeLaw).toHaveBeenCalledWith("L1");
  });

  it("indexes a revision saved with isCurrent: false when it fills an empty current slot", async () => {
    // その法令に現行版が 1 件も無いとき、isCurrent: false で要求した保存でも
    // repository.saveLawDocument は空きスロットを埋めて現行版にする（a00dd05 の規則）。
    // save は要求した options ではなく、その結果を見て索引更新の要否を決めるべき。
    const { repository } = createMemoryStorageRepository();
    const indexLaw = vi.fn<(document: LawDocumentInput) => Promise<void>>(() => Promise.resolve());
    const removeLaw = vi.fn<(lawId: string) => Promise<void>>(() => Promise.resolve());
    const useCase = createSavedLawUseCase(repository, { indexer: { indexLaw, removeLaw } });

    await useCase.save({ law, revision, nodes }, { isCurrent: false });

    expect(indexLaw).toHaveBeenCalledWith({ law, revision, nodes });
  });

  it("skips search indexing when a revision is saved with isCurrent: false while another revision is already current", async () => {
    const { repository } = createMemoryStorageRepository();
    const indexLaw = vi.fn<(document: LawDocumentInput) => Promise<void>>(() => Promise.resolve());
    const removeLaw = vi.fn<(lawId: string) => Promise<void>>(() => Promise.resolve());
    const useCase = createSavedLawUseCase(repository, { indexer: { indexLaw, removeLaw } });

    // 先に現行版を確立してから、別の版を基準日指定で保存する。
    await useCase.save({ law, revision, nodes });
    indexLaw.mockClear();

    await useCase.save({ law, revision: pastRevision, nodes: pastNodes }, { isCurrent: false });

    // 索引は現行版の本文だけを持つ。過去版で上書きすると検索結果が過去版に化ける。
    expect(indexLaw).not.toHaveBeenCalled();
  });

  it("saves the document before pinning the law", async () => {
    const { repository } = createMemoryStorageRepository();
    const useCase = createSavedLawUseCase(repository);

    await useCase.pin({ law, revision, nodes });

    await expect(useCase.isPinned(law.lawId)).resolves.toBe(true);
    await expect(useCase.get(law.lawId)).resolves.toMatchObject({ law, revision, nodes });
  });

  it("pins a past revision without stealing the current revision slot", async () => {
    // 基準日指定で開いた版や pinned アンカーで固定解決した過去版を pin() すると、
    // options を渡し忘れた場合 save の既定 isCurrent: true が効いて既存の現行版を
    // 降格させてしまう（このバグの回帰テスト）。呼び出し側と同じ isCurrent: false を通す。
    const { repository } = createMemoryStorageRepository();
    const useCase = createSavedLawUseCase(repository);

    await repository.saveLawDocument({ law, revision, nodes });
    await repository.saveLawDocument(
      { law, revision: pastRevision, nodes: pastNodes },
      { isCurrent: false },
    );

    await useCase.pin({ law, revision: pastRevision, nodes: pastNodes }, { isCurrent: false });

    await expect(useCase.get(law.lawId)).resolves.toMatchObject({ revision });
    await expect(useCase.isPinned(law.lawId)).resolves.toBe(true);
  });

  it("does not pin the law when saving fails", async () => {
    const { repository } = createMemoryStorageRepository();
    const failing = {
      ...repository,
      saveLawDocument: () => Promise.reject(new Error("quota exceeded")),
    };
    const useCase = createSavedLawUseCase(failing);

    await expect(useCase.pin({ law, revision, nodes })).rejects.toThrow("quota exceeded");

    // 本文の無いピンを作らない。
    await expect(useCase.isPinned(law.lawId)).resolves.toBe(false);
  });

  it("removes the pin from the memory repository when the last revision is deleted", async () => {
    // メモリ実装が実リポジトリと同じ後始末をしないと、これを使う UI テストが幽霊ピンのバグを
    // 隠してしまう。実リポジトリ側の契約は repository.test.ts で固定している。
    const { repository } = createMemoryStorageRepository();
    const useCase = createSavedLawUseCase(repository);

    await useCase.pin({ law, revision, nodes });

    await repository.deleteLawRevision(law.lawId, revision.revisionId);

    await expect(useCase.isPinned(law.lawId)).resolves.toBe(false);
    await expect(useCase.listPinned()).resolves.toEqual([]);
  });
});

const createDatabaseName = (): string => {
  const name = `surasura-roppou-use-case-${crypto.randomUUID()}`;
  openedDatabaseNames.push(name);
  return name;
};

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  lawType: "Act",
  aliases: ["民法"],
  source: "egov",
} satisfies Law;

const revision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  effectiveDate: "2026-06-24",
  fetchedAt: "2026-07-06T00:00:00.000Z",
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
  children: [],
} satisfies LawNode;

const nodes = [articleNode];

// 基準日指定で取得した過去版。revisionId を変え、現行版レコードと別キーで共存させる。
const pastRevision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20200401_508AC0000000012",
  effectiveDate: "2020-04-01",
  fetchedAt: "2026-07-06T00:00:00.000Z",
} satisfies LawRevision;

const pastArticleNode = {
  ...articleNode,
  id: "129AC0000000089:129AC0000000089_20200401_508AC0000000012:article:1",
  revisionId: pastRevision.revisionId,
} satisfies LawNode;

const pastNodes = [pastArticleNode];

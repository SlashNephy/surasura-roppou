import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { createStorageRepository, deleteSurasuraDatabase } from "./repository";
import type { LawDocumentInput, SaveLawDocumentOptions } from "./repository";
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
        byteSize: expect.any(Number) as number,
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

  it("breaks listSavedLawRecords ties on updatedAt the same way the real repository does", async () => {
    // 実リポジトリは savedLaws の複合主キー [lawId, revisionId] の順で updatedAt の同値を
    // 解決する（repository.test.ts で固定）。メモリ実装が revisionId だけでタイブレークすると、
    // ここに依存する自動削除の順序が UI テストでは検出できないまま食い違う。
    const lawZ = { ...law, lawId: "zLaw" } satisfies Law;
    const revisionForZ = {
      ...revision,
      lawId: lawZ.lawId,
      revisionId: "1-revision",
    } satisfies LawRevision;
    const lawA = { ...law, lawId: "aLaw" } satisfies Law;
    const revisionForA = {
      ...revision,
      lawId: lawA.lawId,
      revisionId: "2-revision",
    } satisfies LawRevision;
    const { repository } = createMemoryStorageRepository();

    // createMemoryStorageRepository の既定時計は固定なので、updatedAt は同値になる。
    await repository.saveLawDocument({ law: lawZ, revision: revisionForZ, nodes });
    await repository.saveLawDocument({ law: lawA, revision: revisionForA, nodes });

    const records = await repository.listSavedLawRecords();

    expect(records.map((record) => record.lawId)).toEqual([lawA.lawId, lawZ.lawId]);
  });

  it("evicts history revisions after saving when the limit is exceeded", async () => {
    const { repository } = createMemoryStorageRepository();
    // 現行版 1 件（約 424 バイト）は上限内に収まるが、履歴版と合わせる（約 848 バイト）と
    // 超える値を選ぶ。上限を 1 バイトのように極端に小さくすると、現行版 1 件だけでも
    // 上限を超えてしまい、非現行版が無い第 1 段の対象切れの状態で第 2 段が動いて
    // 現行版ごと法令が消えてしまう（この場合は望ましくない）。
    const useCase = createSavedLawUseCase(repository, { getStorageLimitBytes: () => 500 });

    await useCase.save({ law, revision, nodes });
    await useCase.save({ law, revision: pastRevision, nodes: pastNodes }, { isCurrent: false });

    // 上限を履歴込みの合計が超えるので履歴版は残らない。現行版はダウンロード指定が無くても
    // 第 1 段では消えず、第 1 段だけで上限を下回るため第 2 段（法令単位の削除）も動かない。
    await expect(
      repository.getLawDocumentRevision(law.lawId, pastRevision.revisionId),
    ).resolves.toBeUndefined();
    await expect(useCase.get(law.lawId)).resolves.toMatchObject({ revision });
  });

  it("keeps a pinned law and removes an unpinned one when history is not enough", async () => {
    const { repository } = createMemoryStorageRepository();
    const removeLaw = vi.fn<(lawId: string) => Promise<void>>(() => Promise.resolve());
    const useCase = createSavedLawUseCase(repository, {
      indexer: { indexLaw: () => Promise.resolve(), removeLaw },
      getStorageLimitBytes: () => 1,
    });

    await useCase.pin({ law, revision, nodes });
    await useCase.save({ law: otherLaw, revision: otherRevision, nodes });

    await expect(useCase.get(law.lawId)).resolves.toBeDefined();
    await expect(useCase.get(otherLaw.lawId)).resolves.toBeUndefined();
    // 法令単位の削除では検索索引も落とす。
    expect(removeLaw).toHaveBeenCalledWith(otherLaw.lawId);
  });

  it("retries the save once after evicting when the quota is exceeded", async () => {
    const { repository } = createMemoryStorageRepository();
    let shouldFail = true;
    const saveLawDocument = vi.fn(
      (document: LawDocumentInput, options?: SaveLawDocumentOptions) => {
        if (shouldFail) {
          shouldFail = false;
          const error = new Error("quota exceeded");

          error.name = "QuotaExceededError";
          return Promise.reject(error);
        }
        return repository.saveLawDocument(document, options);
      },
    );
    const useCase = createSavedLawUseCase(
      { ...repository, saveLawDocument },
      { getStorageLimitBytes: () => 1_000_000 },
    );

    await useCase.save({ law, revision, nodes });

    // 上限に余裕があってもディスク逼迫で quota は飛ぶ。1 度だけ再試行して救う。
    expect(saveLawDocument).toHaveBeenCalledTimes(2);
    await expect(useCase.get(law.lawId)).resolves.toBeDefined();
  });

  it("evicts an old unpinned law before retrying the save when the quota is exceeded (limit already exceeded)", async () => {
    const { repository } = createMemoryStorageRepository();
    // 古い未ピン法令を大きめの本文で 2 件あらかじめ保存しておく（上限は最初から超過済み）。
    // どちらが消えても振る舞いとしては等価なので、片方の lawId を名指しで検証すると
    // fixture の並び順（updatedAt が同値のときの lawId 比較）に検出力が依存してしまう。
    // 「2 件のうちちょうど 1 件が消えている」という順序非依存な形で表明する。
    const bulkyNodes = [articleNode, articleNode, articleNode, articleNode];
    const otherLaw2 = { ...otherLaw, lawId: "999AC0000000099", title: "その他の法令2" };
    const otherRevision2 = {
      ...otherRevision,
      lawId: otherLaw2.lawId,
      revisionId: "999AC0000000099_20260624_508AC0000000045",
    };

    await repository.saveLawDocument({ law: otherLaw, revision: otherRevision, nodes: bulkyNodes });
    await repository.saveLawDocument({
      law: otherLaw2,
      revision: otherRevision2,
      nodes: bulkyNodes,
    });

    const lawByteSize = new Blob([JSON.stringify(nodes)]).size;
    const otherLawByteSize = new Blob([JSON.stringify(bulkyNodes)]).size;
    // 2 件のうち 1 件だけ消せば、これから保存する法令を加えても収まる値を選ぶ。
    const limitBytes = otherLawByteSize + lawByteSize;

    let shouldFail = true;
    const saveLawDocument = vi.fn(
      (document: LawDocumentInput, options?: SaveLawDocumentOptions) => {
        if (shouldFail) {
          shouldFail = false;
          const error = new Error("quota exceeded");

          error.name = "QuotaExceededError";
          return Promise.reject(error);
        }
        return repository.saveLawDocument(document, options);
      },
    );
    const useCase = createSavedLawUseCase(
      { ...repository, saveLawDocument },
      { getStorageLimitBytes: () => limitBytes },
    );

    await useCase.save({ law, revision, nodes });

    expect(saveLawDocument).toHaveBeenCalledTimes(2);
    await expect(useCase.get(law.lawId)).resolves.toBeDefined();

    // quota 再試行がエビクションを挟んだ証拠として、2 件のうちちょうど 1 件が消えている。
    const remainingOtherLaws = await Promise.all(
      [otherLaw.lawId, otherLaw2.lawId].map((lawId) => useCase.get(lawId)),
    );

    expect(remainingOtherLaws.filter((document) => document !== undefined)).toHaveLength(1);
  });

  it("evicts an old unpinned law before retrying the save when the quota is exceeded despite headroom under the limit", async () => {
    const { repository } = createMemoryStorageRepository();
    // 設計書が想定した当のケース: 上限には余裕があるが、ディスク逼迫で QuotaExceededError が
    // 飛ぶ。この場合、通常の上限をそのまま削減目標に渡すと planEviction は「合計が上限以下」
    // と判断して何も削除しない（この PR の不具合そのもの）。目標を「現在の合計 − 保存しようと
    // している本文のバイト数」に下げて初めて、この場面で実際に空きを作れる。
    const bulkyNodes = [articleNode, articleNode, articleNode, articleNode];

    await repository.saveLawDocument({ law: otherLaw, revision: otherRevision, nodes: bulkyNodes });

    const lawByteSize = new Blob([JSON.stringify(nodes)]).size;
    const otherLawByteSize = new Blob([JSON.stringify(bulkyNodes)]).size;
    // 既存の合計（otherLawByteSize）どころか、新しい法令を加えた後の合計を足しても
    // まだ上限を大きく下回るようにする。つまり quota エラーの時点で上限には十分な余裕がある。
    const limitBytes = (otherLawByteSize + lawByteSize) * 10;

    let shouldFail = true;
    const saveLawDocument = vi.fn(
      (document: LawDocumentInput, options?: SaveLawDocumentOptions) => {
        if (shouldFail) {
          shouldFail = false;
          const error = new Error("quota exceeded");

          error.name = "QuotaExceededError";
          return Promise.reject(error);
        }
        return repository.saveLawDocument(document, options);
      },
    );
    const useCase = createSavedLawUseCase(
      { ...repository, saveLawDocument },
      { getStorageLimitBytes: () => limitBytes },
    );

    await useCase.save({ law, revision, nodes });

    expect(saveLawDocument).toHaveBeenCalledTimes(2);
    // 上限に余裕があるにもかかわらず、quota 再試行のエビクションが古い法令を実際に消している。
    // 通常の上限をそのまま目標に渡す実装（バグ入り実装）に戻すと、この行が FAIL する。
    await expect(useCase.get(otherLaw.lawId)).resolves.toBeUndefined();
    await expect(useCase.get(law.lawId)).resolves.toBeDefined();
  });

  it("gives up when the retried save fails again", async () => {
    const { repository } = createMemoryStorageRepository();
    const quotaError = new Error("quota exceeded");

    quotaError.name = "QuotaExceededError";
    const saveLawDocument = vi.fn(() => Promise.reject(quotaError));
    const useCase = createSavedLawUseCase(
      { ...repository, saveLawDocument },
      { getStorageLimitBytes: () => 1_000_000 },
    );

    await expect(useCase.save({ law, revision, nodes })).rejects.toThrow("quota exceeded");
    expect(saveLawDocument).toHaveBeenCalledTimes(2);
  });

  it("still retries the save when the eviction inside the quota retry itself fails", async () => {
    const { repository } = createMemoryStorageRepository();
    let shouldFail = true;
    const saveLawDocument = vi.fn(
      (document: LawDocumentInput, options?: SaveLawDocumentOptions) => {
        if (shouldFail) {
          shouldFail = false;
          const error = new Error("quota exceeded");

          error.name = "QuotaExceededError";
          return Promise.reject(error);
        }
        return repository.saveLawDocument(document, options);
      },
    );
    const useCase = createSavedLawUseCase(
      {
        ...repository,
        saveLawDocument,
        // evict 自身が失敗する状況（別の IndexedDB エラー等）を模す。
        listSavedLawRecords: () => Promise.reject(new Error("index broken")),
      },
      { getStorageLimitBytes: () => 1_000_000 },
    );

    // エビクションが失敗しても、それに化けず、1 度きりの再試行は行われて保存は成功する。
    await expect(useCase.save({ law, revision, nodes })).resolves.toBeUndefined();
    expect(saveLawDocument).toHaveBeenCalledTimes(2);
  });

  it("does not fail save when the post-save eviction fails", async () => {
    const { repository } = createMemoryStorageRepository();
    const failingRepository = {
      ...repository,
      listSavedLawRecords: () => Promise.reject(new Error("index broken")),
    };
    const useCase = createSavedLawUseCase(failingRepository, { getStorageLimitBytes: () => 1 });

    // エビクション（保存の要求ではない付随処理）が失敗しても、保存そのものは成功する。
    await expect(useCase.save({ law, revision, nodes })).resolves.toBeUndefined();
    await expect(useCase.get(law.lawId)).resolves.toMatchObject({ law, revision, nodes });
  });

  it("does not evict or retry when the save failure is not a quota error", async () => {
    const { repository } = createMemoryStorageRepository();

    // エビクションが誤って走れば消えてしまう、既存の未ピン法令をあらかじめ用意しておく。
    await repository.saveLawDocument({ law: otherLaw, revision: otherRevision, nodes });

    const error = new Error("Transaction inactive");
    const saveLawDocument = vi.fn(() => Promise.reject(error));
    const useCase = createSavedLawUseCase(
      { ...repository, saveLawDocument },
      { getStorageLimitBytes: () => 1 },
    );

    await expect(useCase.save({ law, revision, nodes })).rejects.toBe(error);

    // quota 以外のエラーでは再試行しない。
    expect(saveLawDocument).toHaveBeenCalledTimes(1);
    // quota 以外のエラーでエビクションも走らない。既存の未ピン法令が残っている。
    await expect(useCase.get(otherLaw.lawId)).resolves.toBeDefined();
  });

  it("backfills a missing byte size instead of treating the record as weightless", async () => {
    const { repository } = createMemoryStorageRepository();

    await repository.saveLawDocument({ law, revision, nodes });
    await repository.setSavedLawByteSize(law.lawId, revision.revisionId, 0);

    const useCase = createSavedLawUseCase({
      ...repository,
      listSavedLawRecords: async () => {
        // PR 3 より前に保存されたレコードを模す（byteSize を持たない）。
        const records = await repository.listSavedLawRecords();

        return records.map(({ byteSize, ...rest }) => {
          void byteSize;
          return rest;
        });
      },
    });

    await useCase.evict(1_000_000);

    const records = await repository.listSavedLawRecords();

    expect(records[0]?.byteSize).toBeGreaterThan(0);
  });

  it("uses the backfilled byte size, not zero, to decide whether eviction is needed", async () => {
    const { repository } = createMemoryStorageRepository();

    await repository.saveLawDocument({ law, revision, nodes });
    await repository.setSavedLawByteSize(law.lawId, revision.revisionId, 0);

    const useCase = createSavedLawUseCase({
      ...repository,
      listSavedLawRecords: async () => {
        // PR 3 より前に保存されたレコードを模す（byteSize を持たない）。
        const records = await repository.listSavedLawRecords();

        return records.map(({ byteSize, ...rest }) => {
          void byteSize;
          return rest;
        });
      },
    });

    const actualByteSize = new Blob([JSON.stringify(nodes)]).size;

    // バックフィルした実測値を候補として使わなければ（0 のままなら）上限を超えず、
    // 削除は起きない。
    await useCase.evict(actualByteSize - 1);

    // 未ピンの法令が丸ごと消えている: バックフィル値を候補として使った証拠。
    await expect(useCase.get(law.lawId)).resolves.toBeUndefined();
  });

  it("does not wipe out every undownloaded law when the quota retry target is computed from legacy records without byteSize", async () => {
    // 再現対象: PR 3 より前に保存された旧レコード（byteSize 無し）が複数ある状態で
    // QuotaExceededError が飛んだとき、computeQuotaRetryEvictionTarget が合計を
    // `?? 0` で素通りすると、実際には十分な余裕があるにもかかわらず目標が 1 バイトに
    // 丸められる。evict の内部では backfillByteSize が真のサイズを解決するため、
    // その 1 バイトという目標がダウンロード指定の無い法令を軒並み削除させてしまう。
    const { repository } = createMemoryStorageRepository();
    const bulkyNodes = [articleNode, articleNode, articleNode, articleNode];
    const otherLaw2 = { ...otherLaw, lawId: "999AC0000000099", title: "その他の法令2" };
    const otherRevision2 = {
      ...otherRevision,
      lawId: otherLaw2.lawId,
      revisionId: "999AC0000000099_20260624_508AC0000000045",
    };
    const otherLaw3 = { ...otherLaw, lawId: "999AC0000000098", title: "その他の法令3" };
    const otherRevision3 = {
      ...otherRevision,
      lawId: otherLaw3.lawId,
      revisionId: "999AC0000000098_20260624_508AC0000000045",
    };

    // 3 件とも実測の byteSize を持つ状態でいったん保存する。
    await repository.saveLawDocument({ law: otherLaw, revision: otherRevision, nodes: bulkyNodes });
    await repository.saveLawDocument({
      law: otherLaw2,
      revision: otherRevision2,
      nodes: bulkyNodes,
    });
    await repository.saveLawDocument({
      law: otherLaw3,
      revision: otherRevision3,
      nodes: bulkyNodes,
    });

    const otherLawByteSize = new Blob([JSON.stringify(bulkyNodes)]).size;
    const lawByteSize = new Blob([JSON.stringify(nodes)]).size;
    // 上限には十分な余裕がある（3 件の合計 + 新規保存分を足しても大きく下回る）。
    const limitBytes = (otherLawByteSize * 3 + lawByteSize) * 10;

    let shouldFail = true;
    const saveLawDocument = vi.fn(
      (document: LawDocumentInput, options?: SaveLawDocumentOptions) => {
        if (shouldFail) {
          shouldFail = false;
          const error = new Error("quota exceeded");

          error.name = "QuotaExceededError";
          return Promise.reject(error);
        }
        return repository.saveLawDocument(document, options);
      },
    );
    const useCase = createSavedLawUseCase(
      {
        ...repository,
        saveLawDocument,
        // PR 3 より前に保存されたレコードを模す（byteSize を持たない）。
        listSavedLawRecords: async () => {
          const records = await repository.listSavedLawRecords();

          return records.map(({ byteSize, ...rest }) => {
            void byteSize;
            return rest;
          });
        },
      },
      { getStorageLimitBytes: () => limitBytes },
    );

    await useCase.save({ law, revision, nodes });

    expect(saveLawDocument).toHaveBeenCalledTimes(2);
    await expect(useCase.get(law.lawId)).resolves.toBeDefined();

    // 目標は「現在の合計 − 保存する本文のバイト数」なので、正しく計算できていれば
    // 3 件のうち 1 件を消せば足り、残り 2 件は生き残る。バグ入り実装（`?? 0`）に戻すと、
    // 目標が 1 バイトに丸められて 3 件とも消える（この行が 0 件になり FAIL する）。
    const remainingOtherLaws = await Promise.all(
      [otherLaw.lawId, otherLaw2.lawId, otherLaw3.lawId].map((lawId) => useCase.get(lawId)),
    );

    expect(remainingOtherLaws.filter((document) => document !== undefined)).toHaveLength(2);
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

// エビクション対象として使う別法令。
const otherLaw = {
  ...law,
  lawId: "132AC0000000048",
  title: "商法",
  lawNumber: "明治三十二年法律第四十八号",
  aliases: ["商法"],
} satisfies Law;

const otherRevision = {
  lawId: otherLaw.lawId,
  revisionId: "132AC0000000048_20260624_508AC0000000045",
  effectiveDate: "2026-06-24",
  fetchedAt: "2026-07-06T00:00:00.000Z",
} satisfies LawRevision;

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

import { planEviction, type EvictionCandidate } from "./eviction-plan";
import type {
  LawDocumentInput,
  SaveLawDocumentOptions,
  SavedLawDocument,
  SavedLawSummary,
} from "./repository";
import type { StorageRepository } from "./repository";
import type { PinnedLawRecord } from "./schema";

export interface SavedLawUseCase {
  save(document: LawDocumentInput, options?: SaveLawDocumentOptions): Promise<void>;
  get(lawId: string): Promise<SavedLawDocument | undefined>;
  list(): Promise<SavedLawSummary[]>;
  remove(lawId: string): Promise<void>;
  pin(document: LawDocumentInput, options?: SaveLawDocumentOptions): Promise<void>;
  unpin(lawId: string): Promise<void>;
  isPinned(lawId: string): Promise<boolean>;
  listPinned(): Promise<PinnedLawRecord[]>;
  evict(limitBytes: number): Promise<void>;
}

// 保存・削除後に検索索引を更新するための最小フック。
// core/search の SearchIndexer が構造的にこれを満たす（storage は search を import しない）。
export interface LawIndexHook {
  indexLaw(document: LawDocumentInput): Promise<void>;
  removeLaw(lawId: string): Promise<void>;
}

export interface SavedLawUseCaseOptions {
  indexer?: LawIndexHook;
  // 上限を返す。未指定ならエビクションも quota 再試行も行わない。
  getStorageLimitBytes?: () => number;
}

export const createSavedLawUseCase = (
  repository: StorageRepository,
  useCaseOptions: SavedLawUseCaseOptions = {},
): SavedLawUseCase => {
  // PR 3 より前に保存されたレコードは byteSize を持たない。0 として扱うと上限の判断が
  // 狂うため、ここで実測して書き戻す。バックグラウンドで走るので本文の読み込みを許容する。
  const backfillByteSize = async (lawId: string, revisionId: string): Promise<number> => {
    const document = await repository.getLawDocumentRevision(lawId, revisionId);

    if (document === undefined) {
      return 0;
    }

    const byteSize = new Blob([JSON.stringify(document.nodes)]).size;

    await repository.setSavedLawByteSize(lawId, revisionId, byteSize);

    return byteSize;
  };

  // 上限（我々の都合）とブラウザの quota（環境の都合）は別物で、上限に余裕があっても
  // ディスク逼迫で QuotaExceededError は飛ぶ。放置すると保存が失敗し続けるため、
  // エビクションを 1 回挟んで 1 度だけ再試行する。
  const saveWithQuotaRetry = async (
    document: LawDocumentInput,
    options?: SaveLawDocumentOptions,
  ) => {
    try {
      return await repository.saveLawDocument(document, options);
    } catch (error) {
      const limitBytes = useCaseOptions.getStorageLimitBytes?.();

      if (limitBytes === undefined || !isQuotaExceededError(error)) {
        throw error;
      }

      await useCase.evict(limitBytes);

      return repository.saveLawDocument(document, options);
    }
  };

  // 保存の本体（quota 再試行 + 索引更新）だけを行い、エビクションは呼ばない。
  // pin はこれを使って「ピンを立ててからエビクションする」順序を作る。save から直接
  // evict すると、pin の内部呼び出しではまだピンが立っていない状態でエビクションが走り、
  // ピン対象の法令自身が消えてから pinLaw が実行される「幽霊ピン」競合が生まれる。
  const saveCore = async (
    document: LawDocumentInput,
    options?: SaveLawDocumentOptions,
  ): Promise<void> => {
    const result = await saveWithQuotaRetry(document, options);

    // 索引は現行版の本文だけを持つ。要求した isCurrent ではなく、実際に現行版スロットへ
    // 入ったかで判断する。現行版が 1 件も無い法令は isCurrent: false の保存でも空きスロット
    // を埋めて現行版になるため、要求値だけで判断すると索引に一生反映されなくなる。
    if (result.isCurrent) {
      await useCaseOptions.indexer?.indexLaw(document);
    }
  };

  // 合計が増えるのは保存の瞬間だけなので、保存後にだけ判定する。呼び出し側（自動保存）が
  // 既に投げっぱなしにしているため、ここでは待ってよい。エビクションの失敗で保存そのものを
  // 失敗させない。
  const evictAfterSave = async (): Promise<void> => {
    const limitBytes = useCaseOptions.getStorageLimitBytes?.();

    if (limitBytes === undefined) {
      return;
    }

    try {
      await useCase.evict(limitBytes);
    } catch {
      // ユーザーが要求した操作ではないため握りつぶす。
    }
  };

  // `this.save` はオブジェクトリテラルのメソッド呼び出しに依存し、分割代入で壊れるため、
  // 変数に束ねてから `useCase.save` を呼ぶ形にする。
  const useCase: SavedLawUseCase = {
    async save(document, options) {
      await saveCore(document, options);
      await evictAfterSave();
    },
    get(lawId) {
      return repository.getLawDocument(lawId);
    },
    list() {
      return repository.listSavedLaws();
    },
    async remove(lawId) {
      await repository.deleteLawDocument(lawId);
      await useCaseOptions.indexer?.removeLaw(lawId);
    },
    async pin(document, options) {
      // 本文の無いピンを作らないよう、保存に成功してからピンを立てる。options を渡さないと
      // save の既定 isCurrent: true が効き、基準日指定や版固定で開いた過去版のピン留めが
      // 現行版スロットを奪ってしまう。呼び出し側（自動保存と同じ判断）に委ねる。
      // エビクションは pinLaw の後で行う。saveCore の直後だとまだピンが立っておらず、
      // 上限が厳しいときにピン対象の法令自身がエビクションで消えてしまう。
      await saveCore(document, options);
      await repository.pinLaw(document.law.lawId);
      await evictAfterSave();
    },
    unpin(lawId) {
      return repository.unpinLaw(lawId);
    },
    isPinned(lawId) {
      return repository.isLawPinned(lawId);
    },
    listPinned() {
      return repository.listPinnedLaws();
    },
    async evict(limitBytes) {
      const [records, pinnedLaws] = await Promise.all([
        repository.listSavedLawRecords(),
        repository.listPinnedLaws(),
      ]);
      const candidates: EvictionCandidate[] = [];

      for (const record of records) {
        candidates.push({
          lawId: record.lawId,
          revisionId: record.revisionId,
          isCurrent: record.isCurrent === 1,
          byteSize: record.byteSize ?? (await backfillByteSize(record.lawId, record.revisionId)),
          updatedAt: record.updatedAt,
        });
      }

      const plan = planEviction(
        candidates,
        new Set(pinnedLaws.map((pinnedLaw) => pinnedLaw.lawId)),
        limitBytes,
      );

      for (const revision of plan.revisions) {
        await repository.deleteLawRevision(revision.lawId, revision.revisionId);
      }

      for (const lawId of plan.lawIds) {
        // remove は本文・ピン・検索索引をまとめて落とす。
        await useCase.remove(lawId);
      }
    },
  };

  return useCase;
};

// DOMException の名前で判定する。ブラウザ間で型が揃わないため instanceof は使わない。
const isQuotaExceededError = (error: unknown): boolean =>
  error instanceof Error && error.name === "QuotaExceededError";

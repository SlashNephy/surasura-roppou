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
}

// 保存・削除後に検索索引を更新するための最小フック。
// core/search の SearchIndexer が構造的にこれを満たす（storage は search を import しない）。
export interface LawIndexHook {
  indexLaw(document: LawDocumentInput): Promise<void>;
  removeLaw(lawId: string): Promise<void>;
}

export interface SavedLawUseCaseOptions {
  indexer?: LawIndexHook;
}

export const createSavedLawUseCase = (
  repository: StorageRepository,
  useCaseOptions: SavedLawUseCaseOptions = {},
): SavedLawUseCase => {
  // `this.save` はオブジェクトリテラルのメソッド呼び出しに依存し、分割代入で壊れるため、
  // 変数に束ねてから `useCase.save` を呼ぶ形にする。
  const useCase: SavedLawUseCase = {
    async save(document, options) {
      const result = await repository.saveLawDocument(document, options);

      // 索引は現行版の本文だけを持つ。要求した isCurrent ではなく、実際に現行版スロットへ
      // 入ったかで判断する。現行版が 1 件も無い法令は isCurrent: false の保存でも空きスロット
      // を埋めて現行版になるため、要求値だけで判断すると索引に一生反映されなくなる。
      if (result.isCurrent) {
        await useCaseOptions.indexer?.indexLaw(document);
      }
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
      await useCase.save(document, options);
      await repository.pinLaw(document.law.lawId);
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
  };

  return useCase;
};

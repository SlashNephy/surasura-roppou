import type { LawDocumentInput, SavedLawDocument, SavedLawSummary } from "./repository";
import type { StorageRepository } from "./repository";

export interface SavedLawUseCase {
  save(document: LawDocumentInput): Promise<void>;
  get(lawId: string): Promise<SavedLawDocument | undefined>;
  list(): Promise<SavedLawSummary[]>;
  remove(lawId: string): Promise<void>;
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
  options: SavedLawUseCaseOptions = {},
): SavedLawUseCase => ({
  async save(document) {
    await repository.saveLawDocument(document);
    await options.indexer?.indexLaw(document);
  },
  get(lawId) {
    return repository.getLawDocument(lawId);
  },
  list() {
    return repository.listSavedLaws();
  },
  async remove(lawId) {
    await repository.deleteLawDocument(lawId);
    await options.indexer?.removeLaw(lawId);
  },
});
